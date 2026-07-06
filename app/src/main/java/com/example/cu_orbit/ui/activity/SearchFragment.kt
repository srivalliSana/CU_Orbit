package com.example.cu_orbit.ui.activity

import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.ViewModelProvider
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.cu_orbit.R
import com.example.cu_orbit.data.*
import coil.load
import com.example.cu_orbit.network.RetrofitClient
import android.util.Log

class SearchFragment : Fragment() {

    private lateinit var viewModel: SearchViewModel
    private lateinit var searchAdapter: SearchAdapter

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_search, container, false)
        
        viewModel = ViewModelProvider(this)[SearchViewModel::class.java]
        
        root.findViewById<ImageView>(R.id.button_search_back).setOnClickListener {
            findNavController().navigateUp()
        }
        
        val editSearch: EditText = root.findViewById(R.id.edit_search)
        val recycler: RecyclerView = root.findViewById(R.id.recycler_search_results)
        recycler.layoutManager = LinearLayoutManager(context)
        
        searchAdapter = SearchAdapter(
            onChannelClick = { ch ->
                val bundle = Bundle().apply {
                    putString("channelName", ch.name)
                    putString("channelId", ch.id)
                }
                findNavController().navigate(R.id.navigation_chat, bundle)
            },
            onUserClick = { user ->
                val bundle = Bundle().apply {
                    putString("channelName", user.name)
                    putString("channelId", user.phone)
                }
                findNavController().navigate(R.id.navigation_chat, bundle)
            },
            onMessageClick = { msg ->
                val bundle = Bundle().apply {
                    val isDm = msg.dmId != null
                    putString("channelName", if (isDm) msg.senderName else "Channel")
                    putString("channelId", msg.dmId ?: msg.channelId)
                    putString("target_message_id", msg.id)
                }
                findNavController().navigate(R.id.navigation_chat, bundle)
            }
        )
        recycler.adapter = searchAdapter

        val prefs = requireContext().getSharedPreferences("CU_ORBIT_PREFS", android.content.Context.MODE_PRIVATE)
        val userId = prefs.getString("USER_ID", "") ?: ""
        val workspaceId = arguments?.getString("workspaceId") ?: ""

        editSearch.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                val query = s.toString().trim()
                if (query.length >= 2) {
                    viewModel.performSearch(query, userId, workspaceId)
                } else {
                    searchAdapter.clear()
                }
            }
            override fun afterTextChanged(s: Editable?) {}
        })

        val prefill = arguments?.getString("prefill_query")
        if (prefill != null) {
            editSearch.setText(prefill)
            editSearch.setSelection(prefill.length)
            viewModel.performSearch(prefill, userId, workspaceId)
        }

        viewModel.searchResults.observe(viewLifecycleOwner) { results ->
            Log.d("SearchFragment", "Results: channels=${results.channels.size}, users=${results.users.size}, messages=${results.messages.size}")
            searchAdapter.setResults(results)
            
            val total = results.channels.size + results.users.size + results.messages.size
            if (total == 0 && editSearch.text.length >= 2) {
                Toast.makeText(context, "No results found for '${editSearch.text}'", Toast.LENGTH_SHORT).show()
            }
        }
        
        return root
    }
}

class SearchAdapter(
    private val onChannelClick: (Channel) -> Unit,
    private val onUserClick: (User) -> Unit,
    private val onMessageClick: (Message) -> Unit
) : RecyclerView.Adapter<RecyclerView.ViewHolder>() {

    private val items = mutableListOf<Any>()

    companion object {
        private const val TYPE_HEADER = 0
        private const val TYPE_CHANNEL = 1
        private const val TYPE_USER = 2
        private const val TYPE_MESSAGE = 3
    }

    fun setResults(results: SearchResponse) {
        items.clear()
        if (results.channels.isNotEmpty()) {
            items.add("Channels")
            items.addAll(results.channels)
        }
        if (results.users.isNotEmpty()) {
            items.add("People")
            items.addAll(results.users)
        }
        if (results.messages.isNotEmpty()) {
            items.add("Messages")
            items.addAll(results.messages)
        }
        notifyDataSetChanged()
    }

    fun clear() {
        items.clear()
        notifyDataSetChanged()
    }

    override fun getItemViewType(position: Int): Int {
        return when (items[position]) {
            is String -> TYPE_HEADER
            is Channel -> TYPE_CHANNEL
            is User -> TYPE_USER
            is Message -> TYPE_MESSAGE
            else -> TYPE_HEADER
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        val inflater = LayoutInflater.from(parent.context)
        return when (viewType) {
            TYPE_HEADER -> HeaderViewHolder(inflater.inflate(R.layout.item_section_header, parent, false))
            TYPE_CHANNEL -> ChannelViewHolder(inflater.inflate(R.layout.item_channel, parent, false))
            TYPE_USER -> UserViewHolder(inflater.inflate(R.layout.item_dm, parent, false))
            TYPE_MESSAGE -> MessageViewHolder(inflater.inflate(R.layout.item_message_received, parent, false))
            else -> throw IllegalArgumentException()
        }
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        val item = items[position]
        when (holder) {
            is HeaderViewHolder -> {
                holder.title.text = item as String
                holder.action.visibility = View.GONE
            }
            is ChannelViewHolder -> {
                val ch = item as Channel
                holder.name.text = "#${ch.name}"
                holder.itemView.setOnClickListener { onChannelClick(ch) }
            }
            is UserViewHolder -> {
                val user = item as User
                holder.name.text = user.name
                val absoluteAvatarUrl = RetrofitClient.getAbsoluteUrl(user.avatarUrl)
                holder.avatar.load(absoluteAvatarUrl) {
                    placeholder(R.drawable.ic_person)
                }
                holder.itemView.setOnClickListener { onUserClick(user) }
            }
            is MessageViewHolder -> {
                val msg = item as Message
                holder.userName.text = msg.senderName
                holder.body.text = msg.text
                
                // Hide extra chat UI elements in search list
                holder.itemView.findViewById<View>(R.id.layout_message_header)?.visibility = View.VISIBLE
                holder.itemView.findViewById<View>(R.id.card_message_image)?.visibility = View.GONE
                holder.itemView.findViewById<View>(R.id.card_voice_player)?.visibility = View.GONE
                holder.itemView.findViewById<View>(R.id.chip_group_reactions)?.visibility = View.GONE
                holder.itemView.findViewById<View>(R.id.layout_thread_indicator)?.visibility = View.GONE

                val absoluteAvatarUrl = RetrofitClient.getAbsoluteUrl(msg.senderAvatarUrl)
                holder.avatar.load(absoluteAvatarUrl) {
                    placeholder(R.drawable.ic_person)
                }
                holder.itemView.setOnClickListener { onMessageClick(msg) }
            }
        }
    }

    override fun getItemCount() = items.size

    class HeaderViewHolder(v: View) : RecyclerView.ViewHolder(v) {
        val title: TextView = v.findViewById(R.id.text_section_title)
        val action: View = v.findViewById(R.id.image_section_action)
    }
    class ChannelViewHolder(v: View) : RecyclerView.ViewHolder(v) {
        val name: TextView = v.findViewById(R.id.text_channel_name)
    }
    class UserViewHolder(v: View) : RecyclerView.ViewHolder(v) {
        val name: TextView = v.findViewById(R.id.text_user_name)
        val avatar: ImageView = v.findViewById(R.id.image_avatar)
    }
    class MessageViewHolder(v: View) : RecyclerView.ViewHolder(v) {
        val userName: TextView = v.findViewById(R.id.text_user_name)
        val body: TextView = v.findViewById(R.id.text_message_body)
        val avatar: ImageView = v.findViewById(R.id.image_profile)
    }
}
