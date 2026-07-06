package com.example.cu_orbit.ui.activity

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.cu_orbit.R
import com.example.cu_orbit.data.ActivityItem
import java.text.SimpleDateFormat
import java.util.*

class ActivityFragment : Fragment() {

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_activity, container, false)
        
        val recycler: RecyclerView = root.findViewById(R.id.recycler_activity)
        recycler.layoutManager = LinearLayoutManager(context)
        
        // Mock data for now
        val items = listOf(
            ActivityItem("1", "mention", "Mention in #general", "Hey @shree, please check the dashboard.", System.currentTimeMillis() - 100000, "general", false),
            ActivityItem("2", "thread", "New reply in thread", "Got it, I'll update the specs.", System.currentTimeMillis() - 500000, "general", true),
            ActivityItem("3", "reaction", "Lavanya reacted 👍", "Great work on the UI!", System.currentTimeMillis() - 2000000, "DM", true)
        )
        
        recycler.adapter = ActivityAdapter(items)
        
        return root
    }
}

class ActivityAdapter(private val items: List<ActivityItem>) : RecyclerView.Adapter<ActivityAdapter.ViewHolder>() {

    class ViewHolder(v: View) : RecyclerView.ViewHolder(v) {
        val icon: ImageView = v.findViewById(R.id.image_activity_icon)
        val title: TextView = v.findViewById(R.id.text_activity_title)
        val body: TextView = v.findViewById(R.id.text_activity_body)
        val time: TextView = v.findViewById(R.id.text_activity_time)
        val unread: View = v.findViewById(R.id.unread_indicator)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val v = LayoutInflater.from(parent.context).inflate(R.layout.item_activity, parent, false)
        return ViewHolder(v)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val item = items[position]
        holder.title.text = item.title
        holder.body.text = item.body
        holder.time.text = SimpleDateFormat("h:mm a", Locale.getDefault()).format(Date(item.timestamp))
        holder.unread.visibility = if (item.isRead) View.GONE else View.VISIBLE
        holder.itemView.setBackgroundColor(if (item.isRead) 0 else 0x1A1E40AF.toInt())

        val iconRes = when(item.type) {
            "mention" -> android.R.drawable.ic_popup_reminder
            "thread" -> android.R.drawable.ic_menu_send
            "reaction" -> android.R.drawable.btn_star
            else -> android.R.drawable.ic_menu_info_details
        }
        holder.icon.setImageResource(iconRes)
    }

    override fun getItemCount() = items.size
}
