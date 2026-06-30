package com.example.cu_orbit.ui.calls

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.example.cu_orbit.R

data class CallLog(val userName: String, val time: String, val isIncoming: Boolean)

class CallsAdapter(private val calls: List<CallLog>) :
    RecyclerView.Adapter<CallsAdapter.ViewHolder>() {

    class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val name: TextView = view.findViewById(R.id.text_call_user)
        val time: TextView = view.findViewById(R.id.text_call_time)
        val arrow: android.widget.ImageView = view.findViewById(R.id.image_call_arrow)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_call, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val call = calls[position]
        holder.name.text = call.userName
        holder.time.text = call.time
        if (call.isIncoming) {
            holder.arrow.setImageResource(android.R.drawable.sym_call_incoming)
        } else {
            holder.arrow.setImageResource(android.R.drawable.sym_call_outgoing)
        }
    }

    override fun getItemCount() = calls.size
}
