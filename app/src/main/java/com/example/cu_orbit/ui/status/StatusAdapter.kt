package com.example.cu_orbit.ui.status

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.example.cu_orbit.R
import com.example.cu_orbit.data.Status
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class StatusAdapter(private val statuses: List<Status>, private val onClick: (Status) -> Unit) :
    RecyclerView.Adapter<StatusAdapter.StatusViewHolder>() {

    class StatusViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val name: TextView = view.findViewById(R.id.text_user_name)
        val time: TextView = view.findViewById(R.id.text_status_time)
        val ring: View = view.findViewById(R.id.view_status_ring)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): StatusViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_status, parent, false)
        return StatusViewHolder(view)
    }

    override fun onBindViewHolder(holder: StatusViewHolder, position: Int) {
        val status = statuses[position]
        holder.name.text = status.userName
        
        // Format time
        try {
            val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault())
            val date = sdf.parse(status.createdAt)
            val now = Date()
            if (date != null) {
                val diff = now.time - date.time
                val hours = diff / (1000 * 60 * 60)
                val minutes = diff / (1000 * 60)
                
                holder.time.text = when {
                    minutes < 1 -> "Just now"
                    minutes < 60 -> "$minutes minutes ago"
                    else -> "$hours hours ago"
                }
            } else {
                holder.time.text = "Recently"
            }
        } catch (e: Exception) {
            holder.time.text = "Recently"
        }

        holder.itemView.setOnClickListener { onClick(status) }
    }

    override fun getItemCount() = statuses.size
}