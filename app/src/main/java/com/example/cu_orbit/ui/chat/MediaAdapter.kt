package com.example.cu_orbit.ui.chat

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.example.cu_orbit.R
import com.example.cu_orbit.data.Message

class MediaAdapter(private val mediaMessages: List<Message>, private val onClick: (Message) -> Unit) :
    RecyclerView.Adapter<MediaAdapter.MediaViewHolder>() {

    class MediaViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val image: ImageView = view.findViewById(R.id.image_media_item)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): MediaViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_media_thumb, parent, false)
        return MediaViewHolder(view)
    }

    override fun onBindViewHolder(holder: MediaViewHolder, position: Int) {
        val message = mediaMessages[position]
        val attachment = message.attachments?.firstOrNull()
        
        if (message.type == "image" && attachment != null) {
            val absoluteUrl = com.example.cu_orbit.network.RetrofitClient.getAbsoluteUrl(attachment.url)
            holder.image.load(absoluteUrl) {
                placeholder(R.drawable.bg_orbit_gradient)
                error(R.drawable.bg_orbit_gradient)
            }
        } else {
            holder.image.setImageResource(android.R.drawable.ic_menu_save) // File placeholder
        }
        holder.itemView.setOnClickListener { onClick(message) }
    }

    override fun getItemCount() = mediaMessages.size
}
