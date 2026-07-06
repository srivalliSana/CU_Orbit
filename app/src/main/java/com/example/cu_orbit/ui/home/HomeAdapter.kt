package com.example.cu_orbit.ui.home

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import com.example.cu_orbit.R
import com.example.cu_orbit.data.*
import coil.load
import java.text.SimpleDateFormat
import java.util.*

class HomeAdapter(
    private val onWorkspaceClick: (Workspace) -> Unit,
    private val onChannelClick: (Channel) -> Unit,
    private val onUserClick: (DirectMessage) -> Unit,
    private val onActionClick: (String) -> Unit
) : RecyclerView.Adapter<RecyclerView.ViewHolder>() {

    private val items = mutableListOf<Any>()
    private val timeFormat = SimpleDateFormat("h:mm", Locale.getDefault())
    private val dateFormat = SimpleDateFormat("d MMM", Locale.getDefault())
    private val weekdayFormat = SimpleDateFormat("EEE", Locale.getDefault())

    companion object {
        private const val TYPE_HEADER = 0
        private const val TYPE_QUICK = 1
        private const val TYPE_CHANNEL = 2
        private const val TYPE_DM = 3
        private const val TYPE_EMPTY = 4
    }

    fun submitList(newList: List<Any>) {
        items.clear()
        items.addAll(newList)
        notifyDataSetChanged()
    }

    override fun getItemViewType(position: Int): Int {
        return when (items[position]) {
            is String -> TYPE_HEADER
            is QuickAccessItem -> TYPE_QUICK
            is Channel -> TYPE_CHANNEL
            is DirectMessage -> TYPE_DM
            is User -> TYPE_DM 
            is EmptyStateItem -> TYPE_EMPTY
            else -> throw IllegalArgumentException("Invalid type ${items[position]::class.java.name}")
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        val inflater = LayoutInflater.from(parent.context)
        return when (viewType) {
            TYPE_HEADER -> HeaderViewHolder(inflater.inflate(R.layout.item_section_header, parent, false))
            TYPE_QUICK -> QuickViewHolder(inflater.inflate(R.layout.item_quick_access, parent, false))
            TYPE_CHANNEL -> ChannelViewHolder(inflater.inflate(R.layout.item_channel, parent, false))
            TYPE_DM -> DmViewHolder(inflater.inflate(R.layout.item_dm, parent, false))
            TYPE_EMPTY -> EmptyViewHolder(inflater.inflate(R.layout.item_empty_state, parent, false))
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
            is QuickViewHolder -> {
                val quick = item as QuickAccessItem
                holder.icon.setImageResource(quick.iconRes)
                holder.label.text = quick.label
                if (quick.count > 0) {
                    holder.badge.visibility = View.VISIBLE
                    holder.badge.text = quick.count.toString()
                    holder.badge.setBackgroundResource(if (quick.isUrgent) R.drawable.bg_badge_danger else R.drawable.bg_badge_accent)
                } else {
                    holder.badge.visibility = View.GONE
                }
                holder.itemView.setOnClickListener { onActionClick(quick.id) }
            }
            is ChannelViewHolder -> {
                val channel = item as Channel
                holder.name.text = channel.name
                holder.prefix.text = if (channel.type == "private") "L" else "#" 
                
                if (channel.unreadCount > 0) {
                    holder.name.setTypeface(null, android.graphics.Typeface.BOLD)
                    holder.name.setTextColor(ContextCompat.getColor(holder.itemView.context, R.color.text_primary))
                    holder.badge.visibility = View.VISIBLE
                    holder.badge.text = channel.unreadCount.toString()
                    holder.badge.setBackgroundResource(if (channel.hasUnreadMention) R.drawable.bg_badge_danger else R.drawable.bg_badge_accent)
                } else {
                    holder.name.setTypeface(null, android.graphics.Typeface.NORMAL)
                    holder.name.setTextColor(ContextCompat.getColor(holder.itemView.context, R.color.text_secondary))
                    holder.badge.visibility = View.GONE
                }

                channel.lastMessagePreview?.let {
                    holder.preview.text = "${it.senderName ?: "Unknown"}: ${it.text ?: ""}"
                    holder.time.text = formatTime(it.sentAt)
                } ?: run {
                    holder.preview.text = ""
                    holder.time.text = ""
                }

                if (channel.isMuted) {
                    holder.itemView.alpha = 0.5f
                    holder.badge.visibility = View.GONE
                } else {
                    holder.itemView.alpha = 1.0f
                }

                holder.itemView.setOnClickListener { onChannelClick(channel) }
            }
            is DmViewHolder -> {
                val dmItem = item
                val name: String
                val unreadCount: Int
                val avatarUrl: String?
                val presence: String
                val lastMsgText: String?
                val lastMsgTime: Long?
                val senderIsSelf: Boolean
                val onClick: () -> Unit

                if (dmItem is DirectMessage) {
                    name = dmItem.otherUserName
                    unreadCount = dmItem.unreadCount
                    avatarUrl = dmItem.otherUserAvatarUrl
                    presence = dmItem.presence
                    lastMsgText = dmItem.lastMessagePreview?.text
                    lastMsgTime = dmItem.lastMessagePreview?.sentAt
                    senderIsSelf = dmItem.lastMessagePreview?.senderIsSelf ?: false
                    onClick = { onUserClick(dmItem) }
                } else {
                    val user = dmItem as User
                    name = user.name
                    unreadCount = user.unreadCount
                    avatarUrl = user.avatarUrl
                    presence = user.presence
                    lastMsgText = user.lastMessagePreview
                    lastMsgTime = try { user.lastMessageTime?.toLong() } catch(e: Exception) { null }
                    senderIsSelf = false
                    onClick = { 
                        onUserClick(DirectMessage(user.phone, user.id, user.name, user.avatarUrl, user.presence, user.unreadCount))
                    }
                }

                holder.name.text = name
                
                if (unreadCount > 0) {
                    holder.name.setTypeface(null, android.graphics.Typeface.BOLD)
                    holder.name.setTextColor(ContextCompat.getColor(holder.itemView.context, R.color.text_primary))
                    holder.badge.visibility = View.VISIBLE
                    holder.badge.text = unreadCount.toString()
                    holder.badge.setBackgroundResource(R.drawable.bg_badge_accent)
                } else {
                    holder.name.setTypeface(null, android.graphics.Typeface.NORMAL)
                    holder.name.setTextColor(ContextCompat.getColor(holder.itemView.context, R.color.text_secondary))
                    holder.badge.visibility = View.GONE
                }

                val absoluteAvatarUrl = com.example.cu_orbit.network.RetrofitClient.getAbsoluteUrl(avatarUrl)
                if (absoluteAvatarUrl?.isNotEmpty() == true) {
                    holder.avatar.load(absoluteAvatarUrl) {
                        crossfade(true)
                        placeholder(R.drawable.ic_person)
                    }
                } else {
                    holder.avatar.setImageResource(R.drawable.ic_person)
                }

                val presenceRes = when(presence) {
                    "online" -> R.drawable.bg_presence_online
                    "away" -> R.drawable.bg_presence_away
                    "dnd" -> R.drawable.bg_presence_dnd
                    else -> R.drawable.bg_presence_offline
                }
                holder.presence.setBackgroundResource(presenceRes)

                if (lastMsgTime != null && lastMsgTime > 0) {
                    val prefix = if (senderIsSelf) "You: " else ""
                    holder.preview.text = "$prefix${lastMsgText ?: ""}"
                    holder.time.text = formatTime(lastMsgTime)
                } else {
                    holder.preview.text = ""
                    holder.time.text = ""
                }

                holder.itemView.setOnClickListener { onClick() }
            }
            is EmptyViewHolder -> {
                val empty = item as EmptyStateItem
                holder.msg.text = empty.text
                holder.icon.setImageResource(empty.iconRes)
                holder.action.text = if (empty.id == "channels") "Browse channels" else "Start a conversation"
                holder.action.setOnClickListener { onActionClick(empty.id.uppercase()) }
            }
        }
    }

    private fun formatTime(sentAt: Long): String {
        if (sentAt <= 0) return ""
        val now = Calendar.getInstance()
        val sent = Calendar.getInstance().apply { timeInMillis = sentAt }
        
        return when {
            isSameDay(now, sent) -> timeFormat.format(sent.time)
            isYesterday(now, sent) -> "Yesterday"
            isSameWeek(now, sent) -> weekdayFormat.format(sent.time)
            else -> dateFormat.format(sent.time)
        }
    }

    private fun isSameDay(c1: Calendar, c2: Calendar) = c1.get(Calendar.DAY_OF_YEAR) == c2.get(Calendar.DAY_OF_YEAR) && c1.get(Calendar.YEAR) == c2.get(Calendar.YEAR)
    private fun isYesterday(now: Calendar, then: Calendar): Boolean {
        val yesterday = now.clone() as Calendar
        yesterday.add(Calendar.DAY_OF_YEAR, -1)
        return isSameDay(yesterday, then)
    }
    private fun isSameWeek(c1: Calendar, c2: Calendar) = c1.get(Calendar.WEEK_OF_YEAR) == c2.get(Calendar.WEEK_OF_YEAR) && c1.get(Calendar.YEAR) == c2.get(Calendar.YEAR)

    override fun getItemCount() = items.size

    class HeaderViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val title: TextView = view.findViewById(R.id.text_section_title)
        val action: View = view.findViewById(R.id.image_section_action)
    }

    class QuickViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val icon: ImageView = view.findViewById(R.id.image_quick_icon)
        val label: TextView = view.findViewById(R.id.text_quick_label)
        val badge: TextView = view.findViewById(R.id.text_quick_badge)
    }

    class ChannelViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val name: TextView = view.findViewById(R.id.text_channel_name)
        val prefix: TextView = view.findViewById(R.id.text_channel_prefix)
        val preview: TextView = view.findViewById(R.id.text_channel_preview)
        val time: TextView = view.findViewById(R.id.text_channel_time)
        val badge: TextView = view.findViewById(R.id.text_channel_badge)
    }

    class DmViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val name: TextView = view.findViewById(R.id.text_user_name)
        val preview: TextView = view.findViewById(R.id.text_last_preview)
        val time: TextView = view.findViewById(R.id.text_last_time)
        val badge: TextView = view.findViewById(R.id.text_unread_badge)
        val avatar: ImageView = view.findViewById(R.id.image_avatar)
        val presence: View = view.findViewById(R.id.view_presence)
    }

    class EmptyViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val icon: ImageView = view.findViewById(R.id.image_empty_icon)
        val msg: TextView = view.findViewById(R.id.text_empty_msg)
        val action: TextView = view.findViewById(R.id.button_empty_action)
    }
}
