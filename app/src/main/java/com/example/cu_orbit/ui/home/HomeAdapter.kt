package com.example.cu_orbit.ui.home

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.example.cu_orbit.R
import com.example.cu_orbit.data.Channel
import com.example.cu_orbit.data.User

class HomeAdapter(
    private val onChannelClick: (Channel) -> Unit, 
    private val onUserClick: (User) -> Unit,
    private val onActionClick: (String) -> Unit
) :
    RecyclerView.Adapter<RecyclerView.ViewHolder>() {

    private val items = mutableListOf<Any>()

    companion object {
        private const val TYPE_HEADER = 0
        private const val TYPE_CHANNEL = 1
        private const val TYPE_DM = 2
    }

    fun submitList(newList: List<Any>) {
        items.clear()
        items.addAll(newList)
        notifyDataSetChanged()
    }

    override fun getItemViewType(position: Int): Int {
        return when (items[position]) {
            is String -> TYPE_HEADER
            is Channel -> TYPE_CHANNEL
            is User -> TYPE_DM
            else -> throw IllegalArgumentException("Invalid type")
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        return when (viewType) {
            TYPE_HEADER -> {
                val view = LayoutInflater.from(parent.context).inflate(R.layout.item_section_header, parent, false)
                HeaderViewHolder(view)
            }
            TYPE_CHANNEL -> {
                val view = LayoutInflater.from(parent.context).inflate(R.layout.item_channel, parent, false)
                ChannelViewHolder(view)
            }
            TYPE_DM -> {
                val view = LayoutInflater.from(parent.context).inflate(R.layout.item_dm, parent, false)
                DmViewHolder(view)
            }
            else -> throw IllegalArgumentException("Invalid view type")
        }
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        val item = items[position]
        when (holder) {
            is HeaderViewHolder -> {
                val title = item as String
                holder.title.text = title
                holder.action.setOnClickListener { onActionClick(title) }
            }
            is ChannelViewHolder -> {
                val channel = item as Channel
                holder.name.text = channel.name
                holder.prefix.text = if (channel.isPrivate) "🔒" else "#"
                
                // Add preview and time if we add them to layout later, but for now focus on DM
                holder.itemView.setOnClickListener { onChannelClick(channel) }
            }
            is DmViewHolder -> {
                val user = item as User
                
                // Name resolution (from contact utils)
                val contactName = com.example.cu_orbit.utils.ContactUtils.getContactName(holder.itemView.context, user.phone)
                holder.name.text = contactName ?: user.name
                
                holder.time.text = user.lastMessageTime
                holder.preview.text = user.lastMessagePreview
                
                // Show delivery status for the last message if it was sent by me
                // In a real app, we'd check lastMessageSenderId. For now, let's mock it.
                holder.lastStatus.visibility = if (user.lastMessagePreview.isNotEmpty()) View.VISIBLE else View.GONE
                
                if (user.unreadCount > 0) {
                    holder.unread.visibility = View.VISIBLE
                    holder.unread.text = user.unreadCount.toString()
                } else {
                    holder.unread.visibility = View.GONE
                }
                
                val statusRes = when(user.status) {
                    "online" -> R.drawable.status_online
                    "away" -> R.drawable.status_away
                    "dnd" -> R.drawable.status_dnd
                    "invite" -> R.drawable.ic_notifications // Using as invite indicator
                    else -> R.drawable.status_offline
                }
                holder.status.setBackgroundResource(statusRes)

                // Add Invite logic
                if (user.status == "invite") {
                    holder.preview.text = "Tap to invite to CU Orbit"
                    holder.itemView.setOnClickListener {
                        com.example.cu_orbit.utils.AppUtils.inviteViaSMS(holder.itemView.context, user.phone)
                    }
                } else {
                    holder.itemView.setOnClickListener { onUserClick(user) }
                }
            }
        }
    }

    override fun getItemCount() = items.size

    class HeaderViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val title: TextView = view.findViewById(R.id.text_section_title)
        val action: View = view.findViewById(R.id.image_section_action)
    }

    class ChannelViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val name: TextView = view.findViewById(R.id.text_channel_name)
        val prefix: TextView = view.findViewById(R.id.text_channel_prefix)
    }

    class DmViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val name: TextView = view.findViewById(R.id.text_user_name)
        val time: TextView = view.findViewById(R.id.text_last_time)
        val preview: TextView = view.findViewById(R.id.text_last_preview)
        val unread: TextView = view.findViewById(R.id.text_unread_badge)
        val status: View = view.findViewById(R.id.view_status)
        val avatar: ImageView = view.findViewById(R.id.image_avatar)
        val lastStatus: ImageView = view.findViewById(R.id.image_last_status)
    }
}