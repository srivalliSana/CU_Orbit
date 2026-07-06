package com.example.cu_orbit.ui.chat

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageButton
import androidx.fragment.app.Fragment
import androidx.lifecycle.ViewModelProvider
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.cu_orbit.R
import com.example.cu_orbit.data.Message
import com.google.gson.Gson

class ThreadFragment : Fragment() {

    private lateinit var adapter: MessageAdapter
    private val repliesList = mutableListOf<Message>()
    private lateinit var viewModel: ChatViewModel
    private var parentMessage: Message? = null

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_thread, container, false)
        
        viewModel = ViewModelProvider(this)[ChatViewModel::class.java]
        
        val messageJson = arguments?.getString("parentMessage")
        parentMessage = Gson().fromJson(messageJson, Message::class.java)

        val toolbar: com.google.android.material.appbar.MaterialToolbar = root.findViewById(R.id.toolbar_thread)
        toolbar.setNavigationOnClickListener { findNavController().navigateUp() }
        
        val recyclerView: RecyclerView = root.findViewById(R.id.recycler_thread)
        recyclerView.layoutManager = LinearLayoutManager(context)
        
        adapter = MessageAdapter(repliesList)
        recyclerView.adapter = adapter

        observeViewModel()
        
        parentMessage?.let { 
            viewModel.startThreadPolling(it.id)
            repliesList.add(it) // Show parent message at top
            adapter.notifyItemInserted(0)
        }

        setupInputArea(root)
        
        return root
    }

    private fun setupInputArea(root: View) {
        val editMessage: EditText = root.findViewById(R.id.edit_thread_message)
        val buttonSend: ImageButton = root.findViewById(R.id.button_thread_send)

        buttonSend.setOnClickListener {
            val text = editMessage.text.toString().trim()
            val parent = parentMessage ?: return@setOnClickListener
            if (text.isNotEmpty()) {
                val prefs = requireContext().getSharedPreferences("CU_ORBIT_PREFS", android.content.Context.MODE_PRIVATE)
                val userId = prefs.getString("USER_ID", "anonymous") ?: "anonymous"
                val userName = prefs.getString("USER_NAME", "Me") ?: "Me"
                
                val containerId = parent.channelId ?: parent.dmId ?: ""
                viewModel.sendMessage(userId, userName, text, containerId, "text", null, parent.id)
                editMessage.setText("")
            }
        }
    }

    private fun observeViewModel() {
        viewModel.threadReplies.observe(viewLifecycleOwner) { replies ->
            repliesList.clear()
            parentMessage?.let { repliesList.add(it) }
            repliesList.addAll(replies)
            adapter.notifyDataSetChanged()
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        viewModel.stopPolling()
    }
}