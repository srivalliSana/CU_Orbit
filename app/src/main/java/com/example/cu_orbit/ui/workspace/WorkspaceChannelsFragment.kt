package com.example.cu_orbit.ui.workspace

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.cu_orbit.R
import com.example.cu_orbit.data.Channel
import com.example.cu_orbit.repository.MainRepository
import kotlinx.coroutines.launch

class WorkspaceChannelsFragment : Fragment() {

    private val repository = MainRepository()
    private var workspaceId: String = ""
    private var workspaceName: String = ""

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_dms, container, false)
        
        workspaceId = arguments?.getString("workspaceId") ?: ""
        workspaceName = arguments?.getString("workspaceName") ?: "Workspace"

        // Using standard toolbar from fragment_dms layout or just a toast
        Toast.makeText(context, "Welcome to $workspaceName", Toast.LENGTH_SHORT).show()

        val recyclerView: RecyclerView = root.findViewById(R.id.recycler_dms_only)
        recyclerView.layoutManager = LinearLayoutManager(context)

        loadChannels(recyclerView)

        root.findViewById<View>(R.id.fab_new_dm).setOnClickListener {
            // Repurpose this to create a channel in this workspace
            showCreateChannelDialog()
        }

        return root
    }

    private fun loadChannels(recyclerView: RecyclerView) {
        lifecycleScope.launch {
            try {
                val channels = repository.getWorkspaceChannels(workspaceId)
                recyclerView.adapter = ChannelAdapter(channels) { channel ->
                    val bundle = Bundle().apply {
                        putString("channelName", channel.name)
                        putString("channelId", channel.id)
                    }
                    findNavController().navigate(R.id.navigation_chat, bundle)
                }
            } catch (e: Exception) {
                Toast.makeText(context, "Error loading channels", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun showCreateChannelDialog() {
        val input = android.widget.EditText(requireContext()).apply { hint = "Channel name (e.g. general)" }
        androidx.appcompat.app.AlertDialog.Builder(requireContext())
            .setTitle("Create Channel in $workspaceName")
            .setView(input)
            .setPositiveButton("Create") { _, _ ->
                val name = input.text.toString().trim()
                if (name.isNotEmpty()) {
                    lifecycleScope.launch {
                        try {
                            repository.createWorkspaceChannel(workspaceId, name, false, "")
                            Toast.makeText(context, "#$name created!", Toast.LENGTH_SHORT).show()
                            loadChannels(requireView().findViewById(R.id.recycler_dms_only))
                        } catch (e: Exception) {
                            Toast.makeText(context, "Error creating channel", Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
}

class ChannelAdapter(private val channels: List<Channel>, private val onClick: (Channel) -> Unit) :
    RecyclerView.Adapter<ChannelAdapter.ViewHolder>() {

    class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val name: TextView = view.findViewById(R.id.text_channel_name)
        val prefix: TextView = view.findViewById(R.id.text_channel_prefix)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_channel, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val channel = channels[position]
        holder.name.text = channel.name
        holder.prefix.text = if (channel.isPrivate) "🔒" else "#"
        holder.itemView.setOnClickListener { onClick(channel) }
    }

    override fun getItemCount() = channels.size
}