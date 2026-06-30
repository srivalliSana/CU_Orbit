package com.example.cu_orbit.ui.dms

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.cu_orbit.R
import com.example.cu_orbit.data.User
import com.example.cu_orbit.ui.home.DmAdapter

import androidx.lifecycle.lifecycleScope
import com.example.cu_orbit.repository.MainRepository
import kotlinx.coroutines.launch

class DmsFragment : Fragment() {

    private val repository = MainRepository()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_dms, container, false)
        
        val recyclerView: RecyclerView = root.findViewById(R.id.recycler_dms_only)
        recyclerView.layoutManager = LinearLayoutManager(context)
        
        lifecycleScope.launch {
            try {
                val users = repository.getUsers()
                val prefs = repository.getPrefs(requireContext())
                val currentUserId = prefs.getString("USER_ID", "")
                
                // Filter out self and resolve contact names
                val otherUsers = users.filter { it.phone != currentUserId }
                
                val adapter = DmAdapter(otherUsers) { user ->
                    val bundle = Bundle().apply {
                        putString("channelName", user.name)
                        putString("channelId", user.phone) // Using phone for 1-on-1 identification
                    }
                    findNavController().navigate(R.id.navigation_chat, bundle)
                }
                recyclerView.adapter = adapter
            } catch (e: Exception) {
                // handle error
            }
        }

        root.findViewById<View>(R.id.fab_new_dm).setOnClickListener {
            findNavController().navigate(R.id.navigation_select_contact)
        }

        return root
    }
}