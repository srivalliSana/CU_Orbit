package com.example.cu_orbit.ui.status

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.cu_orbit.R

class StatusFragment : Fragment() {

    private val pickStatusLauncher = registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri?.let {
            Toast.makeText(context, "Status update posted!", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_status, container, false)

        root.findViewById<View>(R.id.layout_my_status).setOnClickListener {
            pickStatusLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo))
        }

        root.findViewById<View>(R.id.fab_status_camera).setOnClickListener {
            Toast.makeText(context, "Camera status coming soon!", Toast.LENGTH_SHORT).show()
        }

        setupRecyclerView(root)

        return root
    }

    private fun setupRecyclerView(root: View) {
        val recyclerView: RecyclerView = root.findViewById(R.id.recycler_status)
        recyclerView.layoutManager = LinearLayoutManager(context)
        
        val mockUpdates = listOf(
            StatusUpdate("Alice Smith", "10 minutes ago"),
            StatusUpdate("Bob Jones", "1 hour ago"),
            StatusUpdate("Charlie Brown", "3 hours ago"),
            StatusUpdate("Diana Prince", "Yesterday")
        )
        
        recyclerView.adapter = StatusAdapter(mockUpdates)
    }
}