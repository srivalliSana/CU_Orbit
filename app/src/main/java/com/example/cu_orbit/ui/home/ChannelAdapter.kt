package com.example.cu_orbit.ui.home

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.example.cu_orbit.R
import com.example.cu_orbit.data.Channel

class ChannelAdapter(private val channels: List<Channel>, private val onClick: (Channel) -> Unit) :
    RecyclerView.Adapter<ChannelAdapter.ChannelViewHolder>() {

    class ChannelViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val name: TextView = view.findViewById(R.id.text_channel_name)
        val prefix: TextView = view.findViewById(R.id.text_channel_prefix)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ChannelViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_channel, parent, false)
        return ChannelViewHolder(view)
    }

    override fun onBindViewHolder(holder: ChannelViewHolder, position: Int) {
        val channel = channels[position]
        holder.name.text = channel.name
        holder.prefix.text = if (channel.type == "private") "🔒" else "#"
        holder.itemView.setOnClickListener { onClick(channel) }
    }

    override fun getItemCount() = channels.size
}
