package com.example.cu_orbit.ui.chat

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.OpenableColumns
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.cu_orbit.R
import com.example.cu_orbit.data.Message
import com.example.cu_orbit.repository.MainRepository
import com.example.cu_orbit.utils.ContactUtils
import com.google.gson.Gson
import androidx.core.widget.addTextChangedListener
import coil.load
import kotlinx.coroutines.launch
import java.io.File
import java.io.IOException

class ChatFragment : Fragment() {

    private lateinit var adapter: MessageAdapter
    private val messagesList = mutableListOf<Message>()
    private lateinit var viewModel: ChatViewModel
    private val repository = MainRepository()
    private var channelId: String = ""
    private var channelName: String = ""
    private var currentUserId: String = ""
    private var currentUserName: String = ""

    private lateinit var mentionAdapter: MentionAdapter
    private var allChannelMembers = mutableListOf<com.example.cu_orbit.data.User>()
    private var isMentioning = false
    private var mentionTriggerPos = -1
    private val enrichedMentions = mutableListOf<com.example.cu_orbit.data.MentionMetadata>()

    // Voice Recording
    private var mediaRecorder: MediaRecorder? = null
    private var audioFile: File? = null
    private var isRecording = false
    private var startTime: Long = 0

    private val requestPermissionsLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (permissions.values.all { it }) {
            Toast.makeText(context, "Permissions granted!", Toast.LENGTH_SHORT).show()
        }
    }

    private var photoUri: Uri? = null
    private var capturedFile: File? = null
    private val takePictureLauncher = registerForActivityResult(ActivityResultContracts.TakePicture()) { success ->
        if (success) {
            capturedFile?.let { file ->
                lifecycleScope.launch {
                    try {
                        val serverUrl = repository.uploadFile(file)
                        if (serverUrl.isNotEmpty()) {
                            sendMessage("", "image", serverUrl)
                        } else {
                            Toast.makeText(context, "Server error: Empty URL returned", Toast.LENGTH_SHORT).show()
                        }
                    } catch (e: Exception) {
                        Toast.makeText(context, "Upload failed: ${e.message}", Toast.LENGTH_LONG).show()
                    }
                }
            }
        }
    }

    private val pickMediaLauncher = registerForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri?.let {
            val fileName = getFileName(it)
            val type = if (requireContext().contentResolver.getType(it)?.startsWith("image") == true) "image" else "file"
            val localFile = saveUriToLocalFile(it, fileName)
            if (localFile != null) {
                lifecycleScope.launch {
                    try {
                        val serverUrl = repository.uploadFile(localFile)
                        sendMessage(fileName, type, serverUrl)
                    } catch (e: Exception) {
                        Toast.makeText(context, "Upload failed", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }
    }

    private val pickBackgroundLauncher = registerForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri?.let {
            val prefs = requireContext().getSharedPreferences("CU_ORBIT_BG", android.content.Context.MODE_PRIVATE)
            prefs.edit().putString("bg_uri_$channelId", it.toString()).remove("bg_$channelId").apply()
            applyChatBackground(requireView())
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_chat, container, false)
        
        viewModel = ViewModelProvider(this)[ChatViewModel::class.java]
        
        val prefs = requireContext().getSharedPreferences("CU_ORBIT_PREFS", android.content.Context.MODE_PRIVATE)
        currentUserId = prefs.getString("USER_ID", "anonymous") ?: "anonymous"
        currentUserName = prefs.getString("USER_NAME", "Me") ?: "Me"

        val channelNameArg = arguments?.getString("channelName") ?: "general"
        val rawId = arguments?.getString("channelId") ?: "general"
        
        // Determine if it's a DM (ID contains underscore or is a phone number)
        val isDM = rawId.contains("_") || rawId.all { it.isDigit() || it == '+' }
        
        if (isDM && !rawId.contains("_")) {
            // Generate consistent room ID from phone number
            val otherUser = rawId
            channelId = if (currentUserId < otherUser) "${currentUserId}_$otherUser" else "${otherUser}_$currentUserId"
        } else {
            channelId = rawId
        }
        
        setupChatHeader(root, channelNameArg, isDM, rawId)

        root.findViewById<ImageButton>(R.id.button_back).setOnClickListener { findNavController().navigateUp() }

        root.findViewById<View>(R.id.layout_chat_header_info).setOnClickListener {
            val options = if (isDM) arrayOf("Contact Info", "Change Background") else arrayOf("Channel Info", "Change Background")
            androidx.appcompat.app.AlertDialog.Builder(requireContext())
                .setItems(options) { _, which ->
                    if (which == 0) {
                        if (isDM) {
                            val bundle = Bundle().apply { putString("userId", rawId) }
                            findNavController().navigate(R.id.navigation_contact_info, bundle)
                        } else {
                            val bundle = Bundle().apply { putString("channelId", channelId) }
                            findNavController().navigate(R.id.navigation_channel_info, bundle)
                        }
                    } else {
                        showBackgroundPicker()
                    }
                }.show()
        }

        val recyclerView: RecyclerView = root.findViewById(R.id.recycler_messages)
        recyclerView.layoutManager = LinearLayoutManager(context).apply { stackFromEnd = true }
        
        adapter = MessageAdapter(
            messages = messagesList,
            onMessageLongClick = { showActionDialog(it) },
            onThreadClick = { showThreadDialog(it) },
            onReactionClick = { msg, emoji -> viewModel.reactToMessage(msg, currentUserId, currentUserName, emoji) }
        )
        adapter.setCurrentUserId(currentUserId)
        recyclerView.adapter = adapter

        setupMentionSuggestions(root)
        applyChatBackground(root)
        observeViewModel(root)

        // Mark mentions as read when entering the chat
        lifecycleScope.launch {
            try {
                repository.markAllMentionsAsRead(currentUserId, channelId)
            } catch (e: Exception) {}
        }

        viewModel.startPolling(channelId, currentUserId)
        setupInputArea(root)
        
        return root
    }

    private fun setupChatHeader(root: View, nameArg: String, isDM: Boolean, rawId: String) {
        val titleText: TextView = root.findViewById(R.id.text_chat_title)
        val subtitleText: TextView = root.findViewById(R.id.text_chat_subtitle)
        val headerAvatar: ImageView = root.findViewById(R.id.image_chat_header_avatar)
        val btnAdd: ImageView = root.findViewById(R.id.button_add_member)

        if (isDM) {
            headerAvatar.visibility = View.VISIBLE
            val otherUserId = if (rawId.contains("_")) {
                val parts = rawId.split("_")
                if (parts[0] == currentUserId) parts[1] else parts[0]
            } else rawId

            val resolvedName = ContactUtils.getContactName(requireContext(), otherUserId)
            channelName = resolvedName ?: nameArg 
            titleText.text = channelName
            
            lifecycleScope.launch {
                try {
                    val users = repository.getUsers()
                    val otherUser = users.find { it.phone == otherUserId || it.id == otherUserId }
                    subtitleText.text = otherUser?.presence ?: "offline"
                    
                    otherUser?.avatarUrl?.let { url ->
                        if (url.isNotEmpty()) {
                            headerAvatar.load(url) {
                                crossfade(true)
                                placeholder(R.drawable.ic_person)
                                error(R.drawable.ic_person)
                            }
                        }
                    }
                    
                    // DM participant for mentions
                    allChannelMembers.clear()
                    otherUser?.let { allChannelMembers.add(it) }
                } catch (e: Exception) {
                    subtitleText.text = "offline"
                }
            }
            btnAdd.visibility = View.GONE 
        } else {
            headerAvatar.visibility = View.GONE
            channelName = nameArg
            titleText.text = "#$channelName"
            btnAdd.visibility = View.VISIBLE
            btnAdd.setOnClickListener { showAddMemberDialog() }
            
            lifecycleScope.launch {
                try {
                    val channel = repository.getChannel(channelId)
                    subtitleText.text = "${channel.memberCount} members"
                    
                    // --- WhatsApp-style: Restricted Messaging Check ---
                    val members = repository.getChannelMembers(channelId)
                    val me = members.find { it.phone == currentUserId }
                    val isAdmin = me?.role == "admin" || channel.createdBy == currentUserId
                    
                    if (channel.restrictedMessaging && !isAdmin) {
                        root.findViewById<View>(R.id.layout_message_input_container).visibility = View.GONE
                        root.findViewById<TextView>(R.id.text_typing_indicator).apply {
                            visibility = View.VISIBLE
                            text = "Only admins can send messages"
                            setTypeface(null, android.graphics.Typeface.NORMAL)
                        }
                    } else {
                        root.findViewById<View>(R.id.layout_message_input_container).visibility = View.VISIBLE
                    }

                    // Pre-fetch channel members for mentions
                    allChannelMembers.clear()
                    allChannelMembers.addAll(members)
                } catch (e: Exception) {
                    subtitleText.text = ""
                }
            }
        }
    }

    private fun setupMentionSuggestions(root: View) {
        val mentionCard: View = root.findViewById(R.id.card_mention_suggestions)
        val mentionRecycler: RecyclerView = root.findViewById(R.id.recycler_mention_suggestions)
        mentionRecycler.layoutManager = LinearLayoutManager(context)
        
        mentionAdapter = MentionAdapter(emptyList()) { selectedUser ->
            insertMention(selectedUser)
            mentionCard.visibility = View.GONE
            isMentioning = false
        }
        mentionRecycler.adapter = mentionAdapter
    }

    private fun insertMention(user: com.example.cu_orbit.data.User) {
        val editText: EditText = requireView().findViewById(R.id.edit_message)
        val currentText = editText.text
        val cursor = editText.selectionStart
        
        if (mentionTriggerPos != -1 && cursor > mentionTriggerPos) {
            val mentionName = user.name ?: user.phone
            val platformId = user.slackId ?: user.discordId ?: user.telegramHandle ?: "U_ORBIT"
            
            val mention = com.example.cu_orbit.data.MentionMetadata(
                displayName = mentionName,
                userId = user.id,
                platformUserId = platformId,
                phone = user.phone
            )

            val spannable = android.text.SpannableStringBuilder(currentText)
            
            // Replacement text: "@Name "
            val replacement = "@$mentionName "
            spannable.replace(mentionTriggerPos, cursor, replacement)
            
            val span = com.example.cu_orbit.utils.MentionSpan(
                mention = mention,
                color = androidx.core.content.ContextCompat.getColor(requireContext(), R.color.orbit_primary)
            ) { /* No-op in EditText usually, or show small profile card */ }
            
            val start = mentionTriggerPos
            val end = mentionTriggerPos + replacement.length - 1 // Exclude the trailing space
            
            spannable.setSpan(span, start, end, android.text.Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
            
            editText.text = spannable
            editText.setSelection(mentionTriggerPos + replacement.length)
            
            enrichedMentions.add(mention)
        }
    }

    private fun showAddMemberDialog() {
        lifecycleScope.launch {
            try {
                val users = repository.getUsers()
                val names = users.map { it.name }.toTypedArray()
                
                val dialogView = LayoutInflater.from(requireContext()).inflate(R.layout.layout_add_member_search, null)
                val searchInput: EditText = dialogView.findViewById(R.id.edit_search_members)
                val listView: android.widget.ListView = dialogView.findViewById(R.id.list_members)
                
                val listAdapter = android.widget.ArrayAdapter(requireContext(), android.R.layout.simple_list_item_multiple_choice, names)
                listView.adapter = listAdapter
                listView.choiceMode = android.widget.ListView.CHOICE_MODE_MULTIPLE
                
                searchInput.addTextChangedListener { s ->
                    listAdapter.filter.filter(s)
                }

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
                    for (i in 0 until listAdapter.count) {
                        if (checkedPositions.get(i)) {
                            val name = listAdapter.getItem(i)
                            val user = users.find { it.name == name }
                            user?.let {
                                addedCount++
                                lifecycleScope.launch {
                                    try { repository.addChannelMember(channelId, it.phone, currentUserId, currentUserName) } catch (e: Exception) {}
                                }
                            }
                        }
                    }
                    Toast.makeText(context, "Adding $addedCount members...", Toast.LENGTH_SHORT).show()
                    dialog.dismiss()
                }
            } catch (e: Exception) {
                Toast.makeText(context, "Error loading users", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun observeViewModel(root: View) {
        val typingText: TextView = root.findViewById(R.id.text_typing_indicator)
        viewModel.typingUsers.observe(viewLifecycleOwner) { users ->
            val otherTyping = users.filter { it.userId != currentUserId }
            if (otherTyping.isNotEmpty()) {
                typingText.visibility = View.VISIBLE
                val displayMsg = if (otherTyping.size == 1) {
                    val resolvedName = ContactUtils.getContactName(requireContext(), otherTyping[0].userId)
                    "${resolvedName ?: otherTyping[0].userName} is typing..."
                } else {
                    "Multiple people are typing..."
                }
                typingText.text = displayMsg
            } else {
                typingText.visibility = View.GONE
            }
        }

        val recyclerView: RecyclerView = root.findViewById(R.id.recycler_messages)
        viewModel.messages.observe(viewLifecycleOwner) { messages ->
            val oldSize = messagesList.size
            messagesList.clear()
            messagesList.addAll(messages)
            adapter.notifyDataSetChanged()
            
            val targetId = arguments?.getString("target_message_id")
            if (targetId != null) {
                val index = messagesList.indexOfFirst { it.id == targetId }
                if (index != -1) {
                    recyclerView.scrollToPosition(index)
                }
            } else if (messages.size > oldSize) {
                recyclerView.scrollToPosition(messagesList.size - 1)
            }
        }
    }

    private fun setupInputArea(root: View) {
        val editMessage: EditText = root.findViewById(R.id.edit_message)
        val buttonSend: ImageButton = root.findViewById(R.id.button_send)
        val buttonMic: ImageView = root.findViewById(R.id.button_mic)
        val mentionCard: View = root.findViewById(R.id.card_mention_suggestions)

        editMessage.addTextChangedListener { s ->
            viewModel.updateTyping(channelId, currentUserId, currentUserName)
            
            val text = s.toString()
            val cursor = editMessage.selectionStart
            
            // Slack-like mention trigger: find the last '@' before the cursor
            // that is either at the start of the string or preceded by a whitespace.
            val lastAtPos = text.take(cursor).lastIndexOf('@')
            
            if (lastAtPos != -1 && (lastAtPos == 0 || text[lastAtPos - 1].isWhitespace())) {
                val query = text.substring(lastAtPos + 1, cursor)
                
                // If there's a space between @ and cursor, it's not a mention anymore
                if (query.contains(" ")) {
                    isMentioning = false
                    showMentions(false)
                } else {
                    isMentioning = true
                    mentionTriggerPos = lastAtPos
                    filterMentions(query.lowercase())
                }
            } else {
                isMentioning = false
                showMentions(false)
            }
        }

        buttonSend.setOnClickListener {
            val text = editMessage.text.toString().trim()
            if (text.isNotEmpty()) {
                sendMessage(text)
                editMessage.setText("")
                isMentioning = false
                showMentions(false)
            }
        }

        buttonMic.setOnTouchListener { v, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    if (checkPermission(Manifest.permission.RECORD_AUDIO)) {
                        v.performClick()
                        startRecording()
                        v.animate().scaleX(1.5f).scaleY(1.5f).setDuration(200).start()
                        true
                    } else {
                        requestPermissionsLauncher.launch(arrayOf(Manifest.permission.RECORD_AUDIO))
                        false
                    }
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    if (isRecording) {
                        stopRecording()
                        v.animate().scaleX(1.0f).scaleY(1.0f).setDuration(200).start()
                    }
                    true
                }
                else -> false
            }
        }

        root.findViewById<ImageView>(R.id.button_media).setOnClickListener {
            val permission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                Manifest.permission.READ_MEDIA_IMAGES
            } else {
                Manifest.permission.READ_EXTERNAL_STORAGE
            }
            handleFeatureWithPermission(permission) { pickMediaLauncher.launch("*/*") }
        }

        root.findViewById<ImageView>(R.id.button_camera).setOnClickListener {
            handleFeatureWithPermission(Manifest.permission.CAMERA) {
                capturedFile = File(requireContext().getExternalFilesDir(android.os.Environment.DIRECTORY_PICTURES), "camera_photo_${System.currentTimeMillis()}.jpg")
                photoUri = androidx.core.content.FileProvider.getUriForFile(requireContext(), "com.example.cu_orbit.fileprovider", capturedFile!!)
                takePictureLauncher.launch(photoUri)
            }
        }

        root.findViewById<ImageView>(R.id.button_search_chat).setOnClickListener {
            val bundle = Bundle().apply {
                putString("prefill_query", "in:#$channelName ")
            }
            findNavController().navigate(R.id.navigation_search, bundle)
        }
    }

    private fun showMentions(show: Boolean) {
        val card = view?.findViewById<View>(R.id.card_mention_suggestions) ?: return
        if (show) {
            mentionAdapter.updateUsers(allChannelMembers.take(8))
            card.visibility = View.VISIBLE
        } else {
            card.visibility = View.GONE
        }
    }

    private fun filterMentions(query: String) {
        val filtered = allChannelMembers.filter { 
            it.name.lowercase().contains(query) || it.handle.lowercase().contains(query)
        }.take(8)
        
        if (filtered.isNotEmpty()) {
            mentionAdapter.updateUsers(filtered)
            view?.findViewById<View>(R.id.card_mention_suggestions)?.visibility = View.VISIBLE
        } else {
            view?.findViewById<View>(R.id.card_mention_suggestions)?.visibility = View.GONE
        }
    }

    private fun startRecording() {
        val fileName = "voice_msg_${System.currentTimeMillis()}.mp4"
        audioFile = File(requireContext().getExternalFilesDir(null), fileName)
        mediaRecorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(requireContext()) else @Suppress("DEPRECATION") MediaRecorder()
        mediaRecorder?.apply {
            setAudioSource(MediaRecorder.AudioSource.MIC)
            setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            setOutputFile(audioFile?.absolutePath)
            try {
                prepare()
                start()
                isRecording = true
                startTime = System.currentTimeMillis()
                Toast.makeText(context, "Recording started...", Toast.LENGTH_SHORT).show()
            } catch (e: IOException) {
                Toast.makeText(context, "Error starting recorder", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun stopRecording() {
        try {
            if (System.currentTimeMillis() - startTime < 1000) {
                mediaRecorder?.apply { stop(); release() }
                mediaRecorder = null
                isRecording = false
                return
            }
            mediaRecorder?.apply { stop(); release() }
            mediaRecorder = null
            isRecording = false
            
            val fileToUpload = audioFile
            if (fileToUpload != null && fileToUpload.exists()) {
                lifecycleScope.launch {
                    try {
                        val serverUrl = repository.uploadFile(fileToUpload)
                        sendMessage("Voice Message", "voice", serverUrl)
                    } catch (e: Exception) {
                        Toast.makeText(context, "Voice upload failed", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        } catch (e: Exception) { e.printStackTrace() }
    }

    private fun sendMessage(text: String, type: String = "text", mediaUrl: String? = null) {
        val prefs = requireContext().getSharedPreferences("CU_ORBIT_PREFS", android.content.Context.MODE_PRIVATE)
        val avatarUrl = prefs.getString("USER_AVATAR", "")
        
        val editText: EditText = requireView().findViewById(R.id.edit_message)
        val spannable = editText.text
        
        // Extract all MentionSpans currently in the EditText
        val spans = spannable.getSpans(0, spannable.length, com.example.cu_orbit.utils.MentionSpan::class.java)
        val validMentions = spans.map { it.mention }.distinctBy { it.userId }

        viewModel.sendMessage(
            senderId = currentUserId,
            senderName = currentUserName,
            body = text,
            channelId = channelId,
            type = type,
            mediaUrl = mediaUrl,
            senderAvatarUrl = avatarUrl,
            mentions = validMentions.map { it.phone },
            enrichedMentions = validMentions
        )
        enrichedMentions.clear()
    }

    private fun applyChatBackground(root: View) {
        val prefs = requireContext().getSharedPreferences("CU_ORBIT_BG", android.content.Context.MODE_PRIVATE)
        val color = prefs.getInt("bg_$channelId", -1)
        val uriString = prefs.getString("bg_uri_$channelId", null)
        val bgImage: ImageView = root.findViewById(R.id.image_chat_background)
        val recyclerView: RecyclerView = root.findViewById(R.id.recycler_messages)

        bgImage.setImageDrawable(null)
        recyclerView.setBackgroundColor(android.graphics.Color.TRANSPARENT)

        if (uriString != null) {
            bgImage.load(uriString)
        } else if (color != -1) {
            recyclerView.setBackgroundColor(color)
        }
    }

    private fun showBackgroundPicker() {
        val colors = arrayOf("Default", "Pick from Gallery", "Light Blue", "Light Green", "Soft Pink", "Dark Grey")
        val colorValues = intArrayOf(-1, 0, 0xFFE3F2FD.toInt(), 0xFFE8F5E9.toInt(), 0xFFFCE4EC.toInt(), 0xFF263238.toInt())
        
        androidx.appcompat.app.AlertDialog.Builder(requireContext())
            .setTitle("Pick Background")
            .setItems(colors) { _, which ->
                val prefs = requireContext().getSharedPreferences("CU_ORBIT_BG", android.content.Context.MODE_PRIVATE)
                when (which) {
                    0 -> {
                        prefs.edit().remove("bg_$channelId").remove("bg_uri_$channelId").apply()
                        applyChatBackground(requireView())
                    }
                    1 -> pickBackgroundLauncher.launch("image/*")
                    else -> {
                        prefs.edit().putInt("bg_$channelId", colorValues[which]).remove("bg_uri_$channelId").apply()
                        applyChatBackground(requireView())
                    }
                }
            }.show()
    }

    private fun handleFeatureWithPermission(permission: String, action: () -> Unit) {
        if (ContextCompat.checkSelfPermission(requireContext(), permission) == PackageManager.PERMISSION_GRANTED) action()
        else requestPermissionsLauncher.launch(arrayOf(permission))
    }

    private fun checkPermission(permission: String) = ContextCompat.checkSelfPermission(requireContext(), permission) == PackageManager.PERMISSION_GRANTED

    private fun getFileName(uri: Uri): String {
        var result: String? = null
        if (uri.scheme == "content") {
            requireContext().contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (index != -1) result = cursor.getString(index)
                }
            }
        }
        return result ?: uri.path?.substringAfterLast('/') ?: "file"
    }

    private fun saveUriToLocalFile(uri: Uri, fileName: String): File? {
        return try {
            val destination = File(requireContext().getExternalFilesDir(null), "media_$fileName")
            requireContext().contentResolver.openInputStream(uri)?.use { input ->
                destination.outputStream().use { output -> input.copyTo(output) }
            }
            destination
        } catch (e: Exception) { null }
    }

    private fun showActionDialog(message: Message) {
        val actions = arrayOf("👍 React", "🔥 React", "❤️ React", "Edit Message", "Delete Message")
        androidx.appcompat.app.AlertDialog.Builder(requireContext())
            .setItems(actions) { _, which ->
                when (which) {
                    0 -> viewModel.reactToMessage(message, currentUserId, currentUserName, "👍")
                    1 -> viewModel.reactToMessage(message, currentUserId, currentUserName, "🔥")
                    2 -> viewModel.reactToMessage(message, currentUserId, currentUserName, "❤️")
                    3 -> showEditDialog(message)
                    4 -> viewModel.deleteMessage(message)
                }
            }.show()
    }

    private fun showEditDialog(message: Message) {
        val input = EditText(requireContext()).apply { setText(message.text) }
        androidx.appcompat.app.AlertDialog.Builder(requireContext())
            .setTitle("Edit Message")
            .setView(input)
            .setPositiveButton("Save") { _, _ ->
                val newBody = input.text.toString().trim()
                if (newBody.isNotEmpty()) viewModel.editMessage(message.id, newBody, channelId)
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showThreadDialog(message: Message) {
        val bundle = Bundle().apply { putString("parentMessage", Gson().toJson(message)) }
        findNavController().navigate(R.id.navigation_thread, bundle)
    }

    override fun onDestroyView() {
        super.onDestroyView()
        val imm = requireContext().getSystemService(android.content.Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
        view?.windowToken?.let { imm.hideSoftInputFromWindow(it, 0) }

        viewModel.stopPolling()
    }
}
