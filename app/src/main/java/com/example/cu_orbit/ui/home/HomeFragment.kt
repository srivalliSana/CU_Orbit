package com.example.cu_orbit.ui.home

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.lifecycle.ViewModelProvider
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.cu_orbit.R
import com.example.cu_orbit.data.Channel
import com.example.cu_orbit.data.User

class HomeFragment : Fragment() {

    private lateinit var homeAdapter: HomeAdapter
    private lateinit var viewModel: HomeViewModel

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_home, container, false)
        
        viewModel = ViewModelProvider(this)[HomeViewModel::class.java]
        
        root.findViewById<View>(R.id.button_new_dm).setOnClickListener {
            findNavController().navigate(R.id.navigation_select_contact)
        }

        setupRecyclerView(root)
        setupSearch(root)
        observeViewModel()
        
        root.findViewById<View>(R.id.image_workspace).setOnClickListener {
            // Open the navigation drawer from MainActivity
            (activity as? androidx.drawerlayout.widget.DrawerLayout.DrawerListener)?.let {
                // This might not be the direct way, let's find the drawer layout
            }
            activity?.findViewById<androidx.drawerlayout.widget.DrawerLayout>(R.id.drawer_layout)?.open()
        }
        
        root.findViewById<com.google.android.material.floatingactionbutton.FloatingActionButton>(R.id.fab_create).setOnClickListener {
            findNavController().navigate(R.id.navigation_create_channel)
        }
        
        return root
    }

    override fun onResume() {
        super.onResume()
        // Refresh data whenever we return to this screen (e.g., after creating a channel)
        viewModel.loadData()
    }

    private fun observeViewModel() {
        viewModel.channels.observe(viewLifecycleOwner) {
            updateUI()
        }
        viewModel.users.observe(viewLifecycleOwner) {
            updateUI()
        }
    }

    private fun updateUI() {
        val displayList = mutableListOf<Any>()
        
        val channels = viewModel.channels.value ?: emptyList()
        val users = viewModel.users.value ?: emptyList()

        displayList.add("Channels")
        if (channels.isEmpty()) {
            // Optional: add a placeholder if no channels exist
        } else {
            displayList.addAll(channels)
        }
        
        displayList.add("Direct Messages")
        displayList.addAll(users)
        
        homeAdapter.submitList(displayList)
    }

    private fun setupRecyclerView(root: View) {
        val recyclerView: RecyclerView = root.findViewById(R.id.recycler_home)
        recyclerView.layoutManager = LinearLayoutManager(context)
        
        homeAdapter = HomeAdapter(
            onChannelClick = { channel ->
                val bundle = Bundle().apply {
                    putString("channelName", channel.name)
                    putString("channelId", channel.id)
                }
                findNavController().navigate(R.id.navigation_chat, bundle)
            },
            onUserClick = { user ->
                val bundle = Bundle().apply {
                    putString("channelName", user.name)
                    putString("channelId", user.phone) // Using phone for 1-on-1 shared room logic
                }
                findNavController().navigate(R.id.navigation_chat, bundle)
            },
            onActionClick = { section ->
                if (section == "Channels") {
                    findNavController().navigate(R.id.navigation_create_channel)
                } else {
                    findNavController().navigate(R.id.navigation_select_contact)
                }
            }
        )
        recyclerView.adapter = homeAdapter
    }

    private fun setupSearch(root: View) {
        val searchBar: com.google.android.material.search.SearchBar = root.findViewById(R.id.search_bar)
        searchBar.setOnClickListener {
            findNavController().navigate(R.id.navigation_more)
        }
    }
}