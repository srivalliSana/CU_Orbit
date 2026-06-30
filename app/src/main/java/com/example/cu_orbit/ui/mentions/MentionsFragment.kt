package com.example.cu_orbit.ui.mentions

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.cu_orbit.R
import com.example.cu_orbit.data.ActivityItem

class MentionsFragment : Fragment() {

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_mentions, container, false)
        
        val recyclerView: RecyclerView = root.findViewById(R.id.recycler_activity)
        recyclerView.layoutManager = LinearLayoutManager(context)
        
        val dummyActivity = listOf(
            ActivityItem("1", "mention", "Prof. Sharma", "cs-2024", "Please submit your project abstracts by tomorrow.", "2h ago"),
            ActivityItem("2", "reaction", "Alice", "general", "Great work on the CU Orbit UI!", "5h ago"),
            ActivityItem("3", "thread", "Bob Wilson", "internships", "Has anyone applied for the Google summer internship?", "Yesterday"),
            ActivityItem("4", "mention", "Admin", "announcements", "University holiday declared for next Monday.", "2 days ago")
        )
        
        recyclerView.adapter = ActivityAdapter(dummyActivity)
        
        return root
    }
}