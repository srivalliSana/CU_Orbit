package com.example.cu_orbit.ui.calls

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.cu_orbit.R

class CallsFragment : Fragment() {

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_calls, container, false)

        root.findViewById<View>(R.id.fab_new_call).setOnClickListener {
            Toast.makeText(context, "Start a new call feature coming soon!", Toast.LENGTH_SHORT).show()
        }

        setupRecyclerView(root)

        return root
    }

    private fun setupRecyclerView(root: View) {
        val recyclerView: RecyclerView = root.findViewById(R.id.recycler_calls)
        recyclerView.layoutManager = LinearLayoutManager(context)
        
        val mockCalls = listOf(
            CallLog("Alice Smith", "Today, 11:30 AM", true),
            CallLog("Bob Jones", "Today, 10:15 AM", false),
            CallLog("Charlie Brown", "Yesterday, 9:20 PM", true),
            CallLog("Alice Smith", "Yesterday, 6:00 PM", true)
        )
        
        recyclerView.adapter = CallsAdapter(mockCalls)
    }
}