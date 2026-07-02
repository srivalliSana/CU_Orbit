package com.example.cu_orbit.ui.home

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.example.cu_orbit.R
import com.example.cu_orbit.data.User
import com.example.cu_orbit.utils.ContactUtils

class DmAdapter(private val users: List<User>, private val onClick: (User) -> Unit) :
    RecyclerView.Adapter<DmAdapter.DmViewHolder>() {

    class DmViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val name: TextView = view.findViewById(R.id.text_user_name)
        val time: TextView = view.findViewById(R.id.text_last_time)
        val preview: TextView = view.findViewById(R.id.text_last_preview)
        val unread: TextView = view.findViewById(R.id.text_unread_badge)
        val status: View = view.findViewById(R.id.view_status)
        val lastStatus: ImageView = view.findViewById(R.id.image_last_status)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): DmViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_dm, parent, false)
        return DmViewHolder(view)
    }

    override fun onBindViewHolder(holder: DmViewHolder, position: Int) {
        val user = users[position]
        
        val contactName = ContactUtils.getContactName(holder.itemView.context, user.phone)
        holder.name.text = contactName ?: user.name

        val rawTime = user.lastMessageTime ?: ""
        holder.time.text = if (rawTime.isNotEmpty() && rawTime.all { it.isDigit() }) {
            try {
                val timestamp = rawTime.toLong()
                if (timestamp > 0) {
                    java.text.SimpleDateFormat("h:mm a", java.util.Locale.getDefault()).format(java.util.Date(timestamp))
                } else ""
            } catch (e: Exception) { "" }
        } else rawTime

        holder.preview.text = user.lastMessagePreview ?: ""
        
        holder.lastStatus.visibility = View.GONE // Reset
        
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
            else -> R.drawable.status_online
        }
        holder.status.setBackgroundResource(statusRes)
        
        holder.itemView.setOnClickListener { onClick(user) }
    }

    override fun getItemCount() = users.size
}