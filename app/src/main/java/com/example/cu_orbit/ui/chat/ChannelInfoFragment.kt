package com.example.cu_orbit.ui.chat

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.cu_orbit.R
import com.example.cu_orbit.data.Channel
import com.example.cu_orbit.data.User
import com.example.cu_orbit.repository.MainRepository
import coil.load
import kotlinx.coroutines.launch

class ChannelInfoFragment : Fragment() {

    private val repository = MainRepository()
    private var channelId: String = ""
    private var currentChannel: Channel? = null
    private var isAdmin = false
    private var isCreator = false

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_channel_info, container, false)

        channelId = arguments?.getString("channelId") ?: ""
        
        val toolbar: com.google.android.material.appbar.MaterialToolbar = root.findViewById(R.id.toolbar)
        toolbar.setNavigationOnClickListener { findNavController().navigateUp() }

        loadChannelDetails(root)

        root.findViewById<View>(R.id.action_invite_link).setOnClickListener {
            if (!currentChannel!!.infoEditRestricted || isAdmin) {
                shareInviteLink()
            } else {
                Toast.makeText(context, "Only admins can share the invite link", Toast.LENGTH_SHORT).show()
            }
        }

        root.findViewById<View>(R.id.action_add_members).setOnClickListener {
            if (isAdmin || !currentChannel!!.infoEditRestricted) {
                showAddMemberDialog()
            } else {
                Toast.makeText(context, "Only admins can add members", Toast.LENGTH_SHORT).show()
            }
        }

        root.findViewById<View>(R.id.action_delete_channel).setOnClickListener {
            if (isCreator) {
                showDeleteConfirmation()
            }
        }

        return root
    }

    private fun loadChannelDetails(root: View) {
        val nameText: TextView = root.findViewById(R.id.text_channel_name)
        val countText: TextView = root.findViewById(R.id.text_member_count)
        val recycler: RecyclerView = root.findViewById(R.id.recycler_members)
        val deleteBtn: View = root.findViewById(R.id.action_delete_channel)
        
        val currentUserId = repository.getPrefs(requireContext()).getString("USER_ID", "") ?: ""

        lifecycleScope.launch {
            try {
                val channel = repository.getChannel(channelId)
                currentChannel = channel
                nameText.text = "#${channel.name}"
                countText.text = "${channel.memberCount} members"
                
                val initials = if (channel.name.length >= 2) channel.name.substring(0, 2).uppercase() else channel.name.uppercase()
                root.findViewById<TextView>(R.id.text_channel_initials).text = initials

                isCreator = (channel.createdBy == currentUserId)
                deleteBtn.visibility = if (isCreator) View.VISIBLE else View.GONE

                val members = repository.getChannelMembers(channelId)
                
                // Check if current user is admin
                val me = members.find { it.phone == currentUserId }
                isAdmin = me?.role == "admin" || isCreator
                
                root.findViewById<View>(R.id.action_add_members).visibility = if (isAdmin) View.VISIBLE else View.GONE
                
                // --- WhatsApp-style Settings ---
                val restrictedSwitch: com.google.android.material.switchmaterial.SwitchMaterial = root.findViewById(R.id.switch_restricted_messaging)
                val infoSwitch: com.google.android.material.switchmaterial.SwitchMaterial = root.findViewById(R.id.switch_info_restricted)
                val approvalSwitch: com.google.android.material.switchmaterial.SwitchMaterial = root.findViewById(R.id.switch_approval_required)

                if (isAdmin) {
                    restrictedSwitch.visibility = View.VISIBLE
                    infoSwitch.visibility = View.VISIBLE
                    approvalSwitch.visibility = View.VISIBLE

                    restrictedSwitch.isChecked = channel.restrictedMessaging
                    infoSwitch.isChecked = channel.infoEditRestricted
                    approvalSwitch.isChecked = channel.approvalRequired

                    restrictedSwitch.setOnCheckedChangeListener { _, isChecked -> 
                        updateSetting("restricted_messaging", isChecked)
                    }
                    infoSwitch.setOnCheckedChangeListener { _, isChecked -> 
                        updateSetting("info_edit_restricted", isChecked)
                    }
                    approvalSwitch.setOnCheckedChangeListener { _, isChecked -> 
                        updateSetting("approval_required", isChecked)
                    }
                } else {
                    restrictedSwitch.visibility = View.GONE
                    infoSwitch.visibility = View.GONE
                    approvalSwitch.visibility = View.GONE
                }

                recycler.layoutManager = LinearLayoutManager(context)
                recycler.adapter = MemberManagementAdapter(members, isAdmin, currentUserId) { user, action ->
                    handleMemberAction(user, action)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    private fun updateSetting(key: String, value: Any) {
        lifecycleScope.launch {
            try {
                repository.updateChannel(channelId, mapOf(key to value))
            } catch (e: Exception) {
                Toast.makeText(context, "Failed to update setting", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun handleMemberAction(user: User, action: String) {
        lifecycleScope.launch {
            try {
                when (action) {
                    "remove" -> {
                        repository.removeChannelMember(channelId, user.phone)
                        loadChannelDetails(requireView())
                    }
                    "promote" -> {
                        repository.updateMemberRole(channelId, user.phone, "admin")
                        loadChannelDetails(requireView())
                    }
                }
            } catch (e: Exception) {
                Toast.makeText(context, "Action failed", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun showAddMemberDialog() {
        val prefs = repository.getPrefs(requireContext())
        val currentUserId = prefs.getString("USER_ID", "") ?: ""
        val currentUserName = prefs.getString("USER_NAME", "") ?: ""

        lifecycleScope.launch {
            try {
                val users = repository.getUsers()
                // Filter out users who are already members
                val currentMembers = currentChannel?.let { repository.getChannelMembers(it.id) } ?: emptyList()
                val nonMembers = users.filter { u -> currentMembers.none { m -> m.phone == u.phone } }
                
                if (nonMembers.isEmpty()) {
                    Toast.makeText(context, "All users are already in this channel", Toast.LENGTH_SHORT).show()
                    return@launch
                }

                val names = nonMembers.map { it.name }.toTypedArray()

                val dialogView = LayoutInflater.from(requireContext()).inflate(R.layout.layout_add_member_search, null)
                val searchInput: android.widget.EditText = dialogView.findViewById(R.id.edit_search_members)
                val listView: android.widget.ListView = dialogView.findViewById(R.id.list_members)
                
                val adapter = android.widget.ArrayAdapter(requireContext(), android.R.layout.simple_list_item_multiple_choice, names)
                listView.adapter = adapter
                listView.choiceMode = android.widget.ListView.CHOICE_MODE_MULTIPLE
                
                searchInput.addTextChangedListener(object : android.text.TextWatcher {
                    override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                    override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                        adapter.filter.filter(s)
                    }
                    override fun afterTextChanged(s: android.text.Editable?) {}
                })

                val dialog = androidx.appcompat.app.AlertDialog.Builder(requireContext())
                    .setTitle("Add Members")
                    .setView(dialogView)
                    .setPositiveButton("Add", null)
                    .setNegativeButton("Cancel", null)
                    .create()

                dialog.show()

                dialog.getButton(androidx.appcompat.app.AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                    val checkedPositions = listView.checkedItemPositions
                    var addedCount = 0
                    for (i in 0 until adapter.count) {
                        if (checkedPositions.get(i)) {
                            val name = adapter.getItem(i)
                            val user = nonMembers.find { it.name == name }
                            user?.let {
                                addedCount++
                                lifecycleScope.launch {
                                    try { repository.addChannelMember(channelId, it.phone, currentUserId, currentUserName) } catch (e: Exception) {}
                                }
                            }
                        }
                    }
                    if (addedCount > 0) {
                        Toast.makeText(context, "Adding members...", Toast.LENGTH_SHORT).show()
                        // Wait a bit for server to process before refreshing
                        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                            loadChannelDetails(requireView())
                        }, 1000)
                    }
                    dialog.dismiss()
                }
            } catch (e: Exception) {
                Toast.makeText(context, "Error loading users", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun showDeleteConfirmation() {
        androidx.appcompat.app.AlertDialog.Builder(requireContext())
            .setTitle("Delete Channel?")
            .setMessage("This action cannot be undone. All messages and members will be removed.")
            .setPositiveButton("Delete") { _, _ ->
                val currentUserId = repository.getPrefs(requireContext()).getString("USER_ID", "") ?: ""
                lifecycleScope.launch {
                    try {
                        repository.deleteChannel(channelId, currentUserId)
                        Toast.makeText(context, "Channel deleted", Toast.LENGTH_SHORT).show()
                        findNavController().navigate(R.id.navigation_home)
                    } catch (e: Exception) {
                        Toast.makeText(context, "Failed to delete channel", Toast.LENGTH_SHORT).show()
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun shareInviteLink() {
        val code = currentChannel?.inviteCode ?: "orbit123"
        val link = "https://cuorbit.app/join/$code"
        val intent = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(android.content.Intent.EXTRA_TEXT, "Join our university channel on CU Orbit: $link")
        }
        startActivity(android.content.Intent.createChooser(intent, "Share Invite Link"))
    }
}

class MemberManagementAdapter(
    private val members: List<User>,
    private val canManage: Boolean,
    private val currentUserId: String,
    private val onAction: (User, String) -> Unit
) : RecyclerView.Adapter<MemberManagementAdapter.ViewHolder>() {

    class ViewHolder(v: View) : RecyclerView.ViewHolder(v) {
        val name: TextView = v.findViewById(R.id.text_user_name)
        val role: TextView = v.findViewById(R.id.text_last_preview)
        val avatar: android.widget.ImageView = v.findViewById(R.id.image_avatar)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val v = LayoutInflater.from(parent.context).inflate(R.layout.item_dm, parent, false)
        return ViewHolder(v)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val user = members[position]
        val context = holder.itemView.context
        val contactName = com.example.cu_orbit.utils.ContactUtils.getContactName(context, user.phone)
        val nameToDisplay = if (user.phone == currentUserId) "You" else (contactName ?: user.name)
        
        holder.name.text = nameToDisplay
        holder.role.text = if (user.role == "admin") "Admin" else "Member"
        
        val absoluteAvatarUrl = com.example.cu_orbit.network.RetrofitClient.getAbsoluteUrl(user.avatarUrl)
        if (!absoluteAvatarUrl.isNullOrEmpty()) {
            holder.avatar.load(absoluteAvatarUrl) {
                placeholder(R.drawable.ic_person)
            }
        }

        holder.itemView.setOnLongClickListener {
            if (canManage && user.phone != currentUserId) {
                val options = if (user.role == "admin") arrayOf("Remove from Channel") else arrayOf("Promote to Admin", "Remove from Channel")
                androidx.appcompat.app.AlertDialog.Builder(holder.itemView.context)
                    .setTitle(user.name)
                    .setItems(options) { _, which ->
                        if (options[which] == "Remove from Channel") onAction(user, "remove")
                        else onAction(user, "promote")
                    }.show()
            }
            true
        }
    }

    override fun getItemCount() = members.size
}
