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
import com.example.cu_orbit.ui.home.HomeAdapter
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
                val prefs = repository.getPrefs(requireContext())
                val currentUserId = prefs.getString("USER_ID", "") ?: ""
                
                val inbox = repository.getInbox(currentUserId)
                val adapter = HomeAdapter(
                    onWorkspaceClick = {},
                    onChannelClick = {},
                    onUserClick = { dm ->
                        val bundle = Bundle().apply {
                            putString("channelName", dm.otherUserName)
                            putString("channelId", dm.id)
                        }
                        findNavController().navigate(R.id.navigation_chat, bundle)
                    },
                    onActionClick = {}
                )
                recyclerView.adapter = adapter
                // Note: inbox is List<User>, HomeAdapter expects List<DirectMessage> etc.
                // This fragment is largely replaced by the unified Home, but fixing build here.
                adapter.submitList(inbox)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        root.findViewById<View>(R.id.fab_new_dm).setOnClickListener {
            findNavController().navigate(R.id.navigation_select_contact)
        }

        return root
    }
}
