package com.example.cu_orbit.ui.chat

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.example.cu_orbit.R
import com.example.cu_orbit.data.User
import com.example.cu_orbit.repository.MainRepository
import com.example.cu_orbit.utils.ContactUtils
import kotlinx.coroutines.launch

class ContactInfoFragment : Fragment() {

    private val repository = MainRepository()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_contact_info, container, false)

        val userId = arguments?.getString("userId") ?: ""
        
        val toolbar: com.google.android.material.appbar.MaterialToolbar = root.findViewById(R.id.toolbar)
        toolbar.setNavigationOnClickListener { findNavController().navigateUp() }

        val nameText: TextView = root.findViewById(R.id.text_full_name)
        val phoneText: TextView = root.findViewById(R.id.text_phone_number)
        val bioText: TextView = root.findViewById(R.id.text_bio)
        val expandedAvatar: ImageView = root.findViewById(R.id.expanded_avatar)

        lifecycleScope.launch {
            try {
                // We'll search for this user in our registered users
                val users = repository.getUsers()
                val user = users.find { it.id == userId || it.phone == userId }
                
                if (user != null) {
                    val contactName = ContactUtils.getContactName(requireContext(), user.phone)
                    nameText.text = contactName ?: user.name
                    phoneText.text = user.phone
                    bioText.text = user.bio
                } else {
                    // Just show what we know (e.g. if it's a raw number)
                    val contactName = ContactUtils.getContactName(requireContext(), userId)
                    nameText.text = contactName ?: "Unknown User"
                    phoneText.text = userId
                }
                
                setupActions(root, userId)
                loadSharedMedia(root, userId)
                
            } catch (e: Exception) {
                // handle error
            }
        }

        return root
    }

    private fun setupActions(root: View, userId: String) {
        val prefs = requireContext().getSharedPreferences("CU_ORBIT_PREFS", android.content.Context.MODE_PRIVATE)
        
        root.findViewById<View>(R.id.action_mute).setOnClickListener {
            Toast.makeText(context, "Notifications muted for this contact", Toast.LENGTH_SHORT).show()
        }

        root.findViewById<View>(R.id.action_block).setOnClickListener {
            androidx.appcompat.app.AlertDialog.Builder(requireContext())
                .setTitle("Block Contact?")
                .setMessage("Blocked contacts will no longer be able to call you or send you messages.")
                .setPositiveButton("Block") { _, _ -> 
                    Toast.makeText(context, "Contact blocked", Toast.LENGTH_SHORT).show()
                }
                .setNegativeButton("Cancel", null)
                .show()
        }

        root.findViewById<View>(R.id.action_report).setOnClickListener {
            Toast.makeText(context, "Report sent. Thank you.", Toast.LENGTH_SHORT).show()
        }
    }

    private fun loadSharedMedia(root: View, userId: String) {
        val recycler = root.findViewById<androidx.recyclerview.widget.RecyclerView>(R.id.recycler_shared_media)
        val prefs = requireContext().getSharedPreferences("CU_ORBIT_PREFS", android.content.Context.MODE_PRIVATE)
        val currentUserId = prefs.getString("USER_ID", "") ?: return

        lifecycleScope.launch {
            try {
                // Determine the shared DM channel ID
                val channelId = if (currentUserId < userId) "${currentUserId}_$userId" else "${userId}_$currentUserId"
                val messages = repository.getMessages(channelId)
                val mediaMessages = messages.filter { it.type == "image" || it.type == "file" }
                
                if (mediaMessages.isNotEmpty()) {
                    recycler.adapter = MediaAdapter(mediaMessages) { msg ->
                        // Reuse the openMedia logic if we had it here or in a utils class
                        // For now just show a toast or nothing
                    }
                }
            } catch (e: Exception) {}
        }
    }
}