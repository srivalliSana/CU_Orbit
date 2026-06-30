package com.example.cu_orbit.ui.status

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.example.cu_orbit.R

data class StatusUpdate(val userName: String, val time: String)

class StatusAdapter(private val updates: List<StatusUpdate>) :
    RecyclerView.Adapter<StatusAdapter.ViewHolder>() {

    class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val name: TextView = view.findViewById(R.id.text_status_user)
        val time: TextView = view.findViewById(R.id.text_status_time)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_status, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val update = updates[position]
        holder.name.text = update.userName
        holder.time.text = update.time
    }

    override fun getItemCount() = updates.size
}
