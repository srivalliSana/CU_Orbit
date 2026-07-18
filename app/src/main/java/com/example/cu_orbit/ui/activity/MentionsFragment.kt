package com.example.cu_orbit.ui.activity

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.cu_orbit.R
import com.example.cu_orbit.data.ActivityItem
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import kotlinx.coroutines.launch

class MentionsFragment : Fragment() {

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_activity, container, false)
        
        // Customize the title for Mentions screen
        root.findViewById<TextView>(R.id.text_activity_header_title)?.text = "Mentions"
        root.findViewById<View>(R.id.button_mark_all_read)?.visibility = View.GONE

        val recycler: RecyclerView = root.findViewById(R.id.recycler_activity)
        recycler.layoutManager = LinearLayoutManager(context)
        
        loadMentions(root, recycler)
        
        return root
    }

    override fun onResume() {
        super.onResume()
        view?.let { root ->
            val recycler: RecyclerView = root.findViewById(R.id.recycler_activity)
            loadMentions(root, recycler)
        }
    }

    private fun loadMentions(root: View, recycler: RecyclerView) {
        val repository = com.example.cu_orbit.repository.MainRepository()
        val userId = repository.getPrefs(requireContext()).getString("USER_ID", "") ?: ""
        
        lifecycleScope.launch {
            try {
                val mentions = repository.getMentions(userId)
                if (mentions.isEmpty()) {
                    root.findViewById<View>(R.id.layout_empty_activity).visibility = View.VISIBLE
                } else {
                    root.findViewById<View>(R.id.layout_empty_activity).visibility = View.GONE
                    
                    // Map Mention to ActivityItem for reused adapter
                    val items = mentions.map { m ->
                        val title = "${m.senderName ?: "Someone"} mentioned you"
                        val displaySource = if (m.channelName == "STATUS") "Status update" else m.channelName

                        ActivityItem(
                            id = m.id,
                            type = "mention",
                            title = title,
                            body = m.text,
                            timestamp = m.sentAt,
                            sourceName = displaySource,
                            isRead = m.isRead,
                            messageId = m.messageId
                        )
                    }
                    recycler.adapter = ActivityAdapter(items) { item ->
                        val originalMention = mentions.find { it.id == item.id }
                        
                        lifecycleScope.launch {
                            try {
                                repository.markMentionAsRead(item.id)
                            } catch (e: Exception) {}
                        }

                        val bundle = Bundle().apply {
                            putString("channelId", originalMention?.channelId ?: "")
                            putString("channelName", item.sourceName)
                        }
                        findNavController().navigate(R.id.navigation_chat, bundle)
                    }
                }
            } catch (e: Exception) {
                root.findViewById<View>(R.id.layout_empty_activity).visibility = View.VISIBLE
            }
        }
    }
}
