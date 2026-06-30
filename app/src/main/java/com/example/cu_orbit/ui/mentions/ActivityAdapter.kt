package com.example.cu_orbit.ui.mentions

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.example.cu_orbit.R
import com.example.cu_orbit.data.ActivityItem

class ActivityAdapter(private val items: List<ActivityItem>) :
    RecyclerView.Adapter<ActivityAdapter.ActivityViewHolder>() {

    class ActivityViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val title: TextView = view.findViewById(R.id.text_activity_title)
        val time: TextView = view.findViewById(R.id.text_time)
        val preview: TextView = view.findViewById(R.id.text_message_preview)
        val icon: android.widget.ImageView = view.findViewById(R.id.image_icon)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ActivityViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_activity, parent, false)
        return ActivityViewHolder(view)
    }

    override fun onBindViewHolder(holder: ActivityViewHolder, position: Int) {
        val item = items[position]
        holder.title.text = when(item.type) {
            "mention" -> "@${item.userName} mentioned you in #${item.channelName}"
            "reaction" -> "${item.userName} reacted to your message"
            else -> "${item.userName} replied in #${item.channelName}"
        }
        holder.time.text = item.time
        holder.preview.text = item.messagePreview
        
        val iconRes = when(item.type) {
            "mention" -> R.drawable.ic_notifications
            "reaction" -> R.drawable.ic_chat
            else -> R.drawable.ic_chat
        }
        holder.icon.setImageResource(iconRes)
    }

    override fun getItemCount() = items.size
}