package com.example.cu_orbit.ui.home

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.ViewModelProvider
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.cu_orbit.R
import com.example.cu_orbit.data.*
import com.google.android.material.bottomsheet.BottomSheetDialog
import coil.load

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
        
        setupTopBar(root)
        setupRecyclerView(root)
        observeViewModel(root)
        
        root.findViewById<View>(R.id.search_trigger).setOnClickListener {
            val bundle = Bundle().apply {
                putString("workspaceId", viewModel.activeWorkspace.value?.id)
            }
            findNavController().navigate(R.id.navigation_search, bundle)
        }

        root.findViewById<View>(R.id.fab_create).setOnClickListener {
            findNavController().navigate(R.id.navigation_channels)
        }
        
        return root
    }

    override fun onResume() {
        super.onResume()
        viewModel.loadHomeFeed()
    }

    private fun setupTopBar(root: View) {
        root.findViewById<View>(R.id.layout_workspace_switcher).setOnClickListener {
            showWorkspaceSwitcher()
        }
        
        root.findViewById<View>(R.id.button_compose).setOnClickListener {
            findNavController().navigate(R.id.navigation_select_contact)
        }
        
        root.findViewById<View>(R.id.button_search_top).setOnClickListener {
            Toast.makeText(context, "Search coming soon", Toast.LENGTH_SHORT).show()
        }
    }

    private fun observeViewModel(root: View) {
        val wsName: TextView = root.findViewById(R.id.text_workspace_name)
        val wsInitials: TextView = root.findViewById(R.id.text_workspace_initials)

        viewModel.activeWorkspace.observe(viewLifecycleOwner) { ws ->
            ws?.let {
                wsName.text = it.name
                wsInitials.text = if (it.name.length >= 2) it.name.substring(0, 2).uppercase() else it.name.uppercase()
            }
        }

        viewModel.displayItems.observe(viewLifecycleOwner) { items ->
            homeAdapter.submitList(items)
        }
    }

    private fun setupRecyclerView(root: View) {
        val recyclerView: RecyclerView = root.findViewById(R.id.recycler_home)
        recyclerView.layoutManager = LinearLayoutManager(context)
        
        homeAdapter = HomeAdapter(
            onWorkspaceClick = { /* Handled in switcher */ },
            onChannelClick = { channel ->
                val bundle = Bundle().apply {
                    putString("channelName", channel.name)
                    putString("channelId", channel.id)
                }
                findNavController().navigate(R.id.navigation_chat, bundle)
            },
            onUserClick = { dm ->
                val bundle = Bundle().apply {
                    putString("channelName", dm.otherUserName)
                    putString("channelId", dm.id) // Using DM ID
                }
                findNavController().navigate(R.id.navigation_chat, bundle)
            },
            onActionClick = { id ->
                when (id) {
                    "CHANNELS" -> findNavController().navigate(R.id.navigation_channels)
                    "DIRECT MESSAGES", "DMS" -> findNavController().navigate(R.id.navigation_select_contact)
                    "threads" -> Toast.makeText(context, "Threads clicked", Toast.LENGTH_SHORT).show()
                    "mentions" -> findNavController().navigate(R.id.navigation_mentions)
                }
            }
        )
        recyclerView.adapter = homeAdapter
    }

    private fun showWorkspaceSwitcher() {
        val dialog = BottomSheetDialog(requireContext())
        val view = layoutInflater.inflate(R.layout.layout_workspace_switcher, null)
        
        val recycler: RecyclerView = view.findViewById(R.id.recycler_workspaces)
        recycler.layoutManager = LinearLayoutManager(context)
        
        val adapter = WorkspaceSwitcherAdapter(viewModel.workspaces.value ?: emptyList()) { ws ->
            viewModel.switchWorkspace(ws)
            dialog.dismiss()
        }
        recycler.adapter = adapter
        
        view.findViewById<View>(R.id.layout_add_workspace).setOnClickListener {
            // New workspace flow
            dialog.dismiss()
        }
        
        dialog.setContentView(view)
        dialog.show()
    }
}

// Minimal adapter for the switcher
class WorkspaceSwitcherAdapter(
    private val workspaces: List<Workspace>,
    private val onClick: (Workspace) -> Unit
) : RecyclerView.Adapter<WorkspaceSwitcherAdapter.ViewHolder>() {

    class ViewHolder(v: View) : RecyclerView.ViewHolder(v) {
        val icon: ImageView = v.findViewById(R.id.image_ws_icon)
        val name: TextView = v.findViewById(R.id.text_ws_name)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val v = LayoutInflater.from(parent.context).inflate(R.layout.item_workspace_row, parent, false)
        return ViewHolder(v)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val ws = workspaces[position]
        holder.name.text = ws.name
        holder.itemView.setOnClickListener { onClick(ws) }
    }

    override fun getItemCount() = workspaces.size
}
