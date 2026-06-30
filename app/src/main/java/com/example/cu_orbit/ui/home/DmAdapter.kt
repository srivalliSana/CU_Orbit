package com.example.cu_orbit.ui.home

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
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
        val status: View = view.findViewById(R.id.view_status)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): DmViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_dm, parent, false)
        return DmViewHolder(view)
    }

    override fun onBindViewHolder(holder: DmViewHolder, position: Int) {
        val user = users[position]
        
        // Resolve contact name: Use saved contact name if available, else use registered name or phone
        val contactName = ContactUtils.getContactName(holder.itemView.context, user.phone)
        holder.name.text = contactName ?: user.name

        holder.time.text = user.lastMessageTime
        
        val statusRes = when(user.status) {
            "online" -> R.drawable.status_online
            else -> R.drawable.status_online // Default to online for now
        }
        holder.status.setBackgroundResource(statusRes)
        
        holder.itemView.setOnClickListener { onClick(user) }
    }

    override fun getItemCount() = users.size
}