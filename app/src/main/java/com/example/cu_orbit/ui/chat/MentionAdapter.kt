package com.example.cu_orbit.ui.chat

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.example.cu_orbit.R
import com.example.cu_orbit.data.User
import com.example.cu_orbit.network.RetrofitClient
import coil.load

class MentionAdapter(
    private var users: List<User> = emptyList(),
    private val onUserSelected: (User) -> Unit
) : RecyclerView.Adapter<MentionAdapter.MentionViewHolder>() {

    fun submitList(newUsers: List<User>) {
        users = newUsers
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): MentionViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_mention_suggestion, parent, false)
        return MentionViewHolder(view)
    }

    override fun onBindViewHolder(holder: MentionViewHolder, position: Int) {
        val user = users[position]
        holder.name.text = user.name
        holder.handle.text = "@${user.handle ?: user.phone}"
        
        val avatarUrl = RetrofitClient.getAbsoluteUrl(user.avatarUrl)
        if (!avatarUrl.isNullOrEmpty()) {
            holder.avatar.load(avatarUrl) {
                crossfade(true)
                placeholder(R.drawable.ic_person)
                error(R.drawable.ic_person)
            }
        } else {
            holder.avatar.setImageResource(R.drawable.ic_person)
        }

        holder.itemView.setOnClickListener { onUserSelected(user) }
    }

    override fun getItemCount(): Int = users.size

    class MentionViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val avatar: ImageView = view.findViewById(R.id.image_mention_avatar)
        val name: TextView = view.findViewById(R.id.text_mention_name)
        val handle: TextView = view.findViewById(R.id.text_mention_handle)
    }
}
