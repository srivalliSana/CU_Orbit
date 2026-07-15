package com.example.cu_orbit.ui.home

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.viewpager2.adapter.FragmentStateAdapter
import com.example.cu_orbit.R
import com.example.cu_orbit.data.Channel
import com.example.cu_orbit.repository.MainRepository
import com.google.android.material.tabs.TabLayoutMediator
import kotlinx.coroutines.launch

class ChannelTabsFragment : Fragment() {

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_channel_tabs, container, false)
        
        val toolbar: com.google.android.material.appbar.MaterialToolbar = root.findViewById(R.id.toolbar_channels)
        toolbar.setNavigationOnClickListener { findNavController().navigateUp() }
        
        val viewPager = root.findViewById<androidx.viewpager2.widget.ViewPager2>(R.id.view_pager_channels)
        val tabLayout = root.findViewById<com.google.android.material.tabs.TabLayout>(R.id.tab_layout_channels)
        
        viewPager.adapter = object : FragmentStateAdapter(this) {
            override fun getItemCount(): Int = 2
            override fun createFragment(position: Int): Fragment {
                return if (position == 0) BrowseChannelsFragment() else CreateChannelFragment()
            }
        }
        
        TabLayoutMediator(tabLayout, viewPager) { tab, position ->
            tab.text = if (position == 0) "Browse" else "Create"
        }.attach()
        
        return root
    }
}

class BrowseChannelsFragment : Fragment() {
    private val repository = MainRepository()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View? {
        val root = inflater.inflate(R.layout.fragment_dms, container, false) 
        val recyclerView: RecyclerView = root.findViewById(R.id.recycler_dms_only)
        recyclerView.layoutManager = LinearLayoutManager(context)

        loadPublicChannels(recyclerView)

        root.findViewById<com.google.android.material.floatingactionbutton.FloatingActionButton>(R.id.fab_new_dm).apply {
            visibility = View.VISIBLE
            setImageResource(android.R.drawable.ic_menu_share)
            setOnClickListener { showJoinByCodeDialog() }
        }

        return root
    }

    private fun showJoinByCodeDialog() {
        val input = android.widget.EditText(requireContext()).apply { hint = "Enter invite code (e.g. a1b2c3d4)" }
        androidx.appcompat.app.AlertDialog.Builder(requireContext())
            .setTitle("Join Channel by Link/Code")
            .setView(input)
            .setPositiveButton("Join") { _, _ ->
                val code = input.text.toString().trim()
                if (code.isNotEmpty()) {
                    joinByCode(code)
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun joinByCode(code: String) {
        val userId = repository.getPrefs(requireContext()).getString("USER_ID", "") ?: ""
        lifecycleScope.launch {
            try {
                val response = repository.joinChannelByLink(code, userId)
                if (response["success"] == true) {
                    Toast.makeText(context, "Successfully joined channel!", Toast.LENGTH_SHORT).show()
                    findNavController().navigateUp()
                } else {
                    Toast.makeText(context, "Invalid code or already a member", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(context, "Failed to join. Check code.", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun loadPublicChannels(recyclerView: RecyclerView) {
        lifecycleScope.launch {
            try {
                val wsId = repository.getWorkspaces().firstOrNull()?.id ?: ""
                val channels = repository.getWorkspaceChannels(wsId, type = "public")
                
                recyclerView.adapter = BrowseAdapter(channels) { channel ->
                    val userId = repository.getPrefs(requireContext()).getString("USER_ID", "") ?: ""
                    lifecycleScope.launch {
                        try {
                            repository.addChannelMember(channel.id, userId)
                            Toast.makeText(context, "Joined #${channel.name}!", Toast.LENGTH_SHORT).show()
                            val bundle = Bundle().apply {
                                putString("channelName", channel.name)
                                putString("channelId", channel.id)
                            }
                            findNavController().navigate(R.id.navigation_chat, bundle)
                        } catch (e: Exception) {
                            Toast.makeText(context, "Error joining channel", Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
}

class BrowseAdapter(private val channels: List<Channel>, private val onJoin: (Channel) -> Unit) :
    RecyclerView.Adapter<BrowseAdapter.ViewHolder>() {

    class ViewHolder(v: View) : RecyclerView.ViewHolder(v) {
        val name: TextView = v.findViewById(R.id.text_user_name)
        val topic: TextView = v.findViewById(R.id.text_channel_topic)
        val joinBtn: Button = v.findViewById(R.id.button_join_channel)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val v = LayoutInflater.from(parent.context).inflate(R.layout.item_channel_browse, parent, false)
        return ViewHolder(v)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val ch = channels[position]
        holder.name.text = "#${ch.name}"
        holder.topic.text = ch.topic
        holder.joinBtn.setOnClickListener { onJoin(ch) }
    }

    override fun getItemCount() = channels.size
}
