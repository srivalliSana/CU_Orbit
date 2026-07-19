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
import coil.load
import kotlinx.coroutines.launch

class ContactInfoFragment : Fragment() {

    private val repository = MainRepository()
    private var channelIdForBg: String? = null

    private val pickBackgroundLauncher = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.GetContent()) { uri: android.net.Uri? ->
        uri?.let {
            val prefs = requireContext().getSharedPreferences("CU_ORBIT_BG", android.content.Context.MODE_PRIVATE)
            channelIdForBg?.let { id ->
                prefs.edit().putString("bg_uri_$id", it.toString()).remove("bg_$id").apply()
                Toast.makeText(context, "Background image updated", Toast.LENGTH_SHORT).show()
            }
        }
    }

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
                // If the ID passed is a DM channel ID (contains underscore), extract the other user's phone
                val prefs = requireContext().getSharedPreferences("CU_ORBIT_PREFS", android.content.Context.MODE_PRIVATE)
                val currentUserId = prefs.getString("USER_ID", "") ?: ""
                
                val targetPhone = if (userId.contains("_")) {
                    val parts = userId.split("_")
                    if (parts[0] == currentUserId) parts[1] else parts[0]
                } else {
                    userId
                }

                // Fetch full user details from server
                val user = repository.getUser(targetPhone)
                
                val contactName = user.phone?.let { ContactUtils.getContactName(requireContext(), it) }
                nameText.text = contactName ?: user.name ?: user.phone
                phoneText.text = user.phone
                bioText.text = if (user.bio.isNullOrEmpty()) "No status available" else user.bio

                // Load Profile Picture
                val avatarUrl = com.example.cu_orbit.network.RetrofitClient.getAbsoluteUrl(user.avatarUrl)
                if (!avatarUrl.isNullOrEmpty()) {
                    expandedAvatar.load(avatarUrl) {
                        crossfade(true)
                        placeholder(R.drawable.ic_person)
                        error(R.drawable.ic_person)
                    }
                } else {
                    expandedAvatar.setImageResource(R.drawable.ic_person)
                }
                
                setupActions(root, targetPhone)
                loadSharedMedia(root, targetPhone)
                
            } catch (e: Exception) {
                // If server fetch fails, fallback to basic contact lookup
                val contactName = ContactUtils.getContactName(requireContext(), userId)
                nameText.text = contactName ?: userId
                phoneText.text = userId
            }
        }

        return root
    }

    private fun setupActions(root: View, userId: String) {
        root.findViewById<View>(R.id.action_change_background).setOnClickListener {
            // Determine the shared DM channel ID
            val prefs = requireContext().getSharedPreferences("CU_ORBIT_PREFS", android.content.Context.MODE_PRIVATE)
            val currentUserId = prefs.getString("USER_ID", "") ?: ""
            val channelId = if (currentUserId < userId) "${currentUserId}_$userId" else "${userId}_$currentUserId"
            channelIdForBg = channelId

            val colors = arrayOf("Default", "Pick from Gallery", "Light Blue", "Light Green", "Soft Pink", "Dark Grey")
            val colorValues = intArrayOf(-1, 0, 0xFFE3F2FD.toInt(), 0xFFE8F5E9.toInt(), 0xFFFCE4EC.toInt(), 0xFF263238.toInt())
            
            androidx.appcompat.app.AlertDialog.Builder(requireContext())
                .setTitle("Pick Background")
                .setItems(colors) { _, which ->
                    val bgPrefs = requireContext().getSharedPreferences("CU_ORBIT_BG", android.content.Context.MODE_PRIVATE)
                    when (which) {
                        0 -> bgPrefs.edit().remove("bg_$channelId").remove("bg_uri_$channelId").apply()
                        1 -> pickBackgroundLauncher.launch("image/*")
                        else -> bgPrefs.edit().putInt("bg_$channelId", colorValues[which]).remove("bg_uri_$channelId").apply()
                    }
                    Toast.makeText(context, "Background updated", Toast.LENGTH_SHORT).show()
                }.show()
        }

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
                        // Preview media logic
                    }
                }
            } catch (e: Exception) {}
        }
    }
}