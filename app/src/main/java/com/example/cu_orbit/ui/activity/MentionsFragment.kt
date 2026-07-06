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

class MentionsFragment : Fragment() {

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_activity, container, false)
        
        // Customize the title for Mentions screen
        root.findViewById<TextView>(R.id.button_mark_all_read)?.let {
            it.text = "Mentions"
            it.isClickable = false
        }
        
        // Hide top bar title if we want to be specific
        root.findViewById<TextView>(R.id.button_mark_all_read)?.visibility = View.GONE

        val recycler: RecyclerView = root.findViewById(R.id.recycler_activity)
        recycler.layoutManager = LinearLayoutManager(context)
        
        // In a real app, fetch from repository.getMentions(userId)
        // Showing empty state or mock data
        val items = emptyList<ActivityItem>()
        
        if (items.isEmpty()) {
            root.findViewById<View>(R.id.layout_empty_activity).visibility = View.VISIBLE
        } else {
            root.findViewById<View>(R.id.layout_empty_activity).visibility = View.GONE
            recycler.adapter = ActivityAdapter(items)
        }
        
        return root
    }
}
