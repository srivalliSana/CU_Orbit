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
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import com.example.cu_orbit.repository.MainRepository

class HomeFragment : Fragment() {

    private val repository = MainRepository()
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
        setupSelectionToolbar(root)
        setupRecyclerView(root)
        observeViewModel(root)
        
        root.findViewById<View>(R.id.search_trigger).setOnClickListener {
            val bundle = Bundle().apply {
                putString("workspaceId", viewModel.activeWorkspace.value?.id)
            }
            findNavController().navigate(R.id.navigation_search, bundle)
        }

        root.findViewById<View>(R.id.fab_create).setOnClickListener {
            findNavController().navigate(R.id.navigation_select_contact)
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
        
        root.findViewById<View>(R.id.button_more_options).setOnClickListener {
            showHomeOptionsMenu(it)
        }
    }

    private fun setupSelectionToolbar(root: View) {
        root.findViewById<View>(R.id.button_close_selection).setOnClickListener {
            homeAdapter.clearSelection()
        }
        
        root.findViewById<View>(R.id.button_selection_pin).setOnClickListener {
            performSelectionAction("pin")
        }
        
        root.findViewById<View>(R.id.button_selection_delete).setOnClickListener {
            performSelectionAction("delete")
        }
        
        root.findViewById<View>(R.id.button_selection_mute).setOnClickListener {
            performSelectionAction("mute")
        }

        root.findViewById<View>(R.id.button_selection_archive).setOnClickListener {
            performSelectionAction("archive")
        }
    }

    private fun performSelectionAction(action: String) {
        val selectedItems = homeAdapter.getSelectedItems()
        val userId = repository.getPrefs(requireContext()).getString("USER_ID", "") ?: ""
        
        lifecycleScope.launch {
            selectedItems.forEach { item ->
                val containerId = when (item) {
                    is Channel -> item.id
                    is DirectMessage -> item.id
                    is User -> listOf(userId, item.id).sorted().joinToString("_")
                    else -> ""
                }
                
                if (containerId.isNotEmpty()) {
                    try {
                        repository.updateConversationPrefs(containerId, userId, action, "true")
                    } catch (e: Exception) {}
                }
            }
            Toast.makeText(context, "Action: $action applied", Toast.LENGTH_SHORT).show()
            homeAdapter.clearSelection()
            viewModel.loadHomeFeed()
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
        
        val normalToolbar: View = root.findViewById(R.id.layout_normal_toolbar)
        val selectionToolbar: View = root.findViewById(R.id.layout_selection_toolbar)
        val countText: TextView = root.findViewById(R.id.text_selection_count)

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
                    putString("channelId", dm.id)
                }
                findNavController().navigate(R.id.navigation_chat, bundle)
            },
            onActionClick = { id ->
                when (id) {
                    "CHANNELS" -> findNavController().navigate(R.id.navigation_create_channel)
                    "DIRECT MESSAGES", "DMS" -> findNavController().navigate(R.id.navigation_select_contact)
                    "threads" -> Toast.makeText(context, "Threads clicked", Toast.LENGTH_SHORT).show()
                    "mentions" -> findNavController().navigate(R.id.navigation_mentions)
                }
            },
            onSelectionChanged = { count ->
                if (count > 0) {
                    normalToolbar.visibility = View.GONE
                    selectionToolbar.visibility = View.VISIBLE
                    countText.text = count.toString()
                } else {
                    normalToolbar.visibility = View.VISIBLE
                    selectionToolbar.visibility = View.GONE
                }
            }
        )
        recyclerView.adapter = homeAdapter
    }

    private fun showHomeOptionsMenu(anchor: View) {
        val popup = android.widget.PopupMenu(requireContext(), anchor)
        popup.menu.add("New Channel")
        popup.menu.add("Starred Messages")
        popup.menu.add("Mark All as Read")
        popup.menu.add("Settings")

        val prefs = requireContext().getSharedPreferences("CU_ORBIT_PREFS", android.content.Context.MODE_PRIVATE)
        val currentUserId = prefs.getString("USER_ID", "") ?: ""

        popup.setOnMenuItemClickListener { item ->
            when (item.title) {
                "New Channel" -> findNavController().navigate(R.id.navigation_channels)
                "Mark All as Read" -> {
                    lifecycleScope.launch {
                        try {
                            repository.markAllRead(currentUserId)
                            viewModel.loadHomeFeed()
                            Toast.makeText(context, "All messages marked as read", Toast.LENGTH_SHORT).show()
                        } catch (e: Exception) {}
                    }
                }
                "Settings" -> findNavController().navigate(R.id.navigation_settings)
                else -> Toast.makeText(context, "${item.title} coming soon", Toast.LENGTH_SHORT).show()
            }
            true
        }
        popup.show()
    }

    private fun showAddWorkspaceDialog() {
        val input = android.widget.EditText(requireContext()).apply { hint = "Workspace name" }
        androidx.appcompat.app.AlertDialog.Builder(requireContext())
            .setTitle("Create New Workspace")
            .setView(input)
            .setPositiveButton("Create") { _, _ ->
                val name = input.text.toString().trim()
                if (name.isNotEmpty()) {
                    lifecycleScope.launch {
                        try {
                            repository.createWorkspace(name, "")
                            Toast.makeText(context, "Workspace created!", Toast.LENGTH_SHORT).show()
                            viewModel.loadHomeFeed()
                        } catch (e: Exception) {}
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
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
            showAddWorkspaceDialog()
            dialog.dismiss()
        }
        
        dialog.setContentView(view)
        dialog.show()
    }
}

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
