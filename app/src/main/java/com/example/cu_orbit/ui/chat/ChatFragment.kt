package com.example.cu_orbit.ui.chat

import android.Manifest
import android.media.MediaRecorder
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.fragment.app.Fragment
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.example.cu_orbit.R
import com.example.cu_orbit.data.*
import com.example.cu_orbit.network.RetrofitClient
import com.example.cu_orbit.repository.MainRepository
import com.example.cu_orbit.utils.ContactUtils
import com.example.cu_orbit.utils.MentionSpan
import kotlinx.coroutines.launch
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.util.*

class ChatFragment : Fragment() {

    private lateinit var adapter: MessageAdapter
    private val messagesList = mutableListOf<Message>()
    private lateinit var viewModel: ChatViewModel
    private val repository = MainRepository()
    private var channelId: String = ""
    private var channelName: String = ""
    private var currentUserId: String = ""
    private var currentUserName: String = ""
    private var isAdmin: Boolean = false

    private lateinit var mentionAdapter: MentionAdapter
    private val allChannelMembers = mutableListOf<User>()
    private var isMentioning = false
    private var mentionTriggerPos = -1
    private val enrichedMentions = mutableListOf<MentionMetadata>()

    private var mediaRecorder: MediaRecorder? = null
    private var audioFile: File? = null
    private var isRecording = false
    private var startTime: Long = 0

    private val requestPermissionsLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { permissions ->
            if (permissions[Manifest.permission.RECORD_AUDIO] == true) { }
        }

    private var photoUri: Uri? = null
    private var capturedFile: File? = null
    private val takePictureLauncher = registerForActivityResult(ActivityResultContracts.TakePicture()) { success ->
        if (success) {
            capturedFile?.let { file ->
                lifecycleScope.launch {
                    try {
                        val url = repository.uploadFile(file)
                        sendMessage("image", url, null)
                    } catch (e: Exception) {
                        Toast.makeText(context, "Upload failed", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }
    }

    private val pickMediaLauncher = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let {
            val fileName = getFileName(it)
            val file = saveUriToLocalFile(it, fileName)
            file?.let { f ->
                lifecycleScope.launch {
                    try {
                        val url = repository.uploadFile(f)
                        val type = if (fileName.endsWith(".jpg") || fileName.endsWith(".png")) "image" else "file"
                        sendMessage(type, url, fileName)
                    } catch (e: Exception) {
                        Toast.makeText(context, "Upload failed", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }
    }

    private val pickBackgroundLauncher = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let {
            val prefs = repository.getPrefs(requireContext())
            prefs.edit().putString("CHAT_BG_$channelId", it.toString()).apply()
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
        
        // DM ID Resolution
        val isDM = rawId.contains("_") || rawId.all { it.isDigit() || it == '+' }
        if (isDM && !rawId.contains("_")) {
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
                    when (options[which]) {
                        "Contact Info" -> {
                            val otherUserId = if (channelId.contains("_")) {
                                val parts = channelId.split("_")
                                if (parts[0] == currentUserId) parts[1] else parts[0]
                            } else channelId
                            val bundle = Bundle().apply { putString("userId", otherUserId) }
                            findNavController().navigate(R.id.navigation_contact_info, bundle)
                        }
                        "Channel Info" -> {
                            val bundle = Bundle().apply { putString("channelId", channelId) }
                            findNavController().navigate(R.id.navigation_channel_info, bundle)
                        }
                        "Change Background" -> showBackgroundPicker()
                    }
                }.show()
        }

        val recycler: RecyclerView = root.findViewById(R.id.recycler_messages)
        recycler.layoutManager = LinearLayoutManager(context).apply { stackFromEnd = true }
        
        adapter = MessageAdapter(
            messagesList, 
            { msg -> showActionDialog(msg) }, 
            { msg -> showThreadDialog(msg) }, 
            { msg, emoji -> viewModel.reactToMessage(msg, currentUserId, currentUserName, emoji) }
        )
        adapter.setCurrentUserId(currentUserId)
        recycler.adapter = adapter

        setupMentionSuggestions(root)
        applyChatBackground(root)
        observeViewModel(root)

        lifecycleScope.launch {
            try { repository.markAllMentionsAsRead(currentUserId, channelId) } catch (e: Exception) {}
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
                        if (url.isNotEmpty()) headerAvatar.load(url) { placeholder(R.drawable.ic_person) }
                    }
                    allChannelMembers.clear()
                    otherUser?.let { allChannelMembers.add(it) }
                } catch (e: Exception) { subtitleText.text = "offline" }
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
                    val members = repository.getChannelMembers(channelId)
                    val me = members.find { it.phone == currentUserId }
                    isAdmin = me?.role == "admin" || channel.createdBy == currentUserId
                    
                    if (channel.restrictedMessaging && !isAdmin) {
                        root.findViewById<View>(R.id.layout_message_input_container).visibility = View.GONE
                        root.findViewById<TextView>(R.id.text_typing_indicator).apply {
                            visibility = View.VISIBLE
                            text = "Only admins can send messages"
                        }
                    } else {
                        root.findViewById<View>(R.id.layout_message_input_container).visibility = View.VISIBLE
                    }
                    allChannelMembers.clear()
                    allChannelMembers.addAll(members)
                } catch (e: Exception) { subtitleText.text = "" }
            }
        }
    }

    private fun setupMentionSuggestions(root: View) {
        val mentionRecycler: RecyclerView = root.findViewById(R.id.recycler_mention_suggestions)
        mentionRecycler.layoutManager = LinearLayoutManager(context)
        mentionAdapter = MentionAdapter { user -> insertMention(user) }
        mentionRecycler.adapter = mentionAdapter
    }

    private fun insertMention(user: User) {
        val input: EditText = requireView().findViewById(R.id.edit_message)
        val text = input.text
        if (mentionTriggerPos != -1) {
            val cursorPosition = input.selectionStart
            val metadata = MentionMetadata(displayName = user.name, userId = user.id, phone = user.phone)
            enrichedMentions.add(metadata)

            val mentionText = "@${user.name}"
            val span = MentionSpan(metadata, ContextCompat.getColor(requireContext(), R.color.orbit_primary)) { m ->
                val bundle = Bundle().apply { putString("userId", m.userId) }
                findNavController().navigate(R.id.navigation_contact_info, bundle)
            }
            val spannable = android.text.SpannableString(mentionText)
            spannable.setSpan(span, 0, mentionText.length, android.text.Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
            text.replace(mentionTriggerPos, cursorPosition, spannable)
            text.append(" ")
            showMentions(false)
        }
    }

    private fun showAddMemberDialog() {
        lifecycleScope.launch {
            try {
                val users = repository.getUsers()
                val names = users.map { it.name }.toTypedArray()
                androidx.appcompat.app.AlertDialog.Builder(requireContext())
                    .setTitle("Add Member")
                    .setItems(names) { _, which ->
                        val selected = users[which]
                        lifecycleScope.launch {
                            repository.addChannelMember(channelId, selected.id, currentUserId, currentUserName)
                        }
                    }.show()
            } catch (e: Exception) {}
        }
    }

    private fun observeViewModel(root: View) {
        viewModel.messages.observe(viewLifecycleOwner) { messages ->
            val oldSize = messagesList.size
            messagesList.clear()
            messagesList.addAll(messages)
            adapter.notifyDataSetChanged()
            if (messagesList.size > oldSize) {
                root.findViewById<RecyclerView>(R.id.recycler_messages).scrollToPosition(messagesList.size - 1)
            }
        }
        viewModel.typingUsers.observe(viewLifecycleOwner) { typing ->
            val indicator: TextView = root.findViewById(R.id.text_typing_indicator)
            if (typing.isEmpty()) indicator.visibility = View.GONE
            else {
                indicator.visibility = View.VISIBLE
                val names = typing.map { it.userName }.distinct()
                indicator.text = if (names.size == 1) "${names[0]} is typing..." else "Multiple people typing..."
            }
        }
    }

    private fun setupInputArea(root: View) {
        val input: EditText = root.findViewById(R.id.edit_message)
        val btnSend: View = root.findViewById(R.id.button_send)
        val btnCamera: View = root.findViewById(R.id.button_camera)
        val btnMic: ImageView = root.findViewById(R.id.button_mic)
        val btnAttach: View = root.findViewById(R.id.button_media)

        input.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                viewModel.notifyTyping(channelId, currentUserId, currentUserName)
                val text = s?.toString() ?: ""
                val cursorPosition = input.selectionStart
                if (cursorPosition > 0) {
                    val lastChar = text[cursorPosition - 1]
                    if (lastChar == '@') {
                        isMentioning = true
                        mentionTriggerPos = cursorPosition - 1
                        showMentions(true)
                        filterMentions("")
                    } else if (isMentioning) {
                        if (lastChar == ' ' || cursorPosition <= mentionTriggerPos) {
                            isMentioning = false
                            showMentions(false)
                        } else {
                            val query = text.substring(mentionTriggerPos + 1, cursorPosition)
                            filterMentions(query)
                        }
                    }
                }
            }
            override fun afterTextChanged(s: Editable?) {}
        })

        btnSend.setOnClickListener {
            val text = input.text.toString().trim()
            if (text.isNotEmpty()) {
                val req = MessageRequest(currentUserId, currentUserName, text, channelId, "text", null, null, null, null, enrichedMentions.toList())
                viewModel.sendMessage(req)
                input.setText("")
                enrichedMentions.clear()
            }
        }
        btnCamera.setOnClickListener {
            handleFeatureWithPermission(Manifest.permission.CAMERA) {
                try {
                    val file = File.createTempFile("IMG_", ".jpg", requireContext().cacheDir)
                    capturedFile = file
                    photoUri = FileProvider.getUriForFile(requireContext(), "${requireContext().packageName}.fileprovider", file)
                    takePictureLauncher.launch(photoUri)
                } catch (e: IOException) {}
            }
        }
        btnMic.setOnLongClickListener {
            handleFeatureWithPermission(Manifest.permission.RECORD_AUDIO) {
                startRecording()
                btnMic.setColorFilter(ContextCompat.getColor(requireContext(), R.color.orbit_error))
            }
            true
        }
        btnMic.setOnClickListener {
            if (isRecording) { stopRecording(); btnMic.clearColorFilter() }
        }
        btnAttach.setOnClickListener { pickMediaLauncher.launch("*/*") }
    }

    private fun showMentions(show: Boolean) {
        requireView().findViewById<View>(R.id.card_mention_suggestions).visibility = if (show) View.VISIBLE else View.GONE
    }

    private fun filterMentions(query: String) {
        val filtered = if (query.isEmpty()) allChannelMembers else allChannelMembers.filter { it.name.contains(query, ignoreCase = true) }
        mentionAdapter.submitList(filtered)
        showMentions(filtered.isNotEmpty())
    }

    private fun startRecording() {
        try {
            audioFile = File.createTempFile("VOICE_", ".m4a", requireContext().cacheDir)
            mediaRecorder = MediaRecorder().apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setOutputFile(audioFile?.absolutePath)
                prepare()
                start()
            }
            isRecording = true
            startTime = System.currentTimeMillis()
        } catch (e: IOException) {}
    }

    private fun stopRecording() {
        if (!isRecording) return
        try {
            mediaRecorder?.apply { stop(); release() }
            mediaRecorder = null
            isRecording = false
            if (System.currentTimeMillis() - startTime > 1000) {
                audioFile?.let { file ->
                    lifecycleScope.launch {
                        try {
                            val url = repository.uploadFile(file)
                            sendMessage("voice", url, null)
                        } catch (e: Exception) {}
                    }
                }
            }
        } catch (e: Exception) {}
    }

    private fun sendMessage(type: String, url: String, filename: String?) {
        val req = MessageRequest(currentUserId, currentUserName, if (type == "voice") "Voice Message" else (filename ?: "Image"), channelId, type, url)
        viewModel.sendMessage(req)
    }

    private fun applyChatBackground(root: View) {
        val prefs = repository.getPrefs(requireContext())
        val bgUri = prefs.getString("CHAT_BG_$channelId", null)
        if (bgUri != null) root.findViewById<ImageView>(R.id.image_chat_background).load(Uri.parse(bgUri))
    }

    private fun showBackgroundPicker() { pickBackgroundLauncher.launch("image/*") }

    private fun handleFeatureWithPermission(permission: String, action: () -> Unit) {
        if (checkPermission(permission)) action() else requestPermissionsLauncher.launch(arrayOf(permission))
    }

    private fun checkPermission(p: String) = ContextCompat.checkSelfPermission(requireContext(), p) == android.content.pm.PackageManager.PERMISSION_GRANTED

    private fun getFileName(uri: Uri): String {
        var resName: String? = null
        if (uri.scheme == "content") {
            requireContext().contentResolver.query(uri, null, null, null, null)?.use {
                val idx = it.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (it.moveToFirst() && idx != -1) resName = it.getString(idx)
            }
        }
        return resName ?: uri.path?.substringAfterLast('/') ?: "file"
    }

    private fun saveUriToLocalFile(uri: Uri, name: String): File? {
        return try {
            val file = File(requireContext().cacheDir, name)
            requireContext().contentResolver.openInputStream(uri)?.use { input ->
                FileOutputStream(file).use { output -> input.copyTo(output) }
            }
            file
        } catch (e: Exception) { null }
    }

    private fun showActionDialog(message: Message) {
        val isOwnMessage = message.senderId.takeLast(10) == currentUserId.takeLast(10)
        val actions = mutableListOf("👍 React", "🔥 React", "❤️ React")
        if (isOwnMessage) actions.add("Edit Message")
        if (isOwnMessage || isAdmin) actions.add("Delete Message")
        androidx.appcompat.app.AlertDialog.Builder(requireContext())
            .setItems(actions.toTypedArray()) { _, which ->
                val act = actions[which]
                if (act.contains("React")) viewModel.reactToMessage(message, currentUserId, currentUserName, act.substring(0, 2))
                else if (act == "Edit Message") showEditDialog(message)
                else if (act == "Delete Message") viewModel.deleteMessage(message)
            }.show()
    }

    private fun showEditDialog(message: Message) {
        val input = EditText(requireContext()).apply { setText(message.text) }
        androidx.appcompat.app.AlertDialog.Builder(requireContext()).setTitle("Edit").setView(input)
            .setPositiveButton("Save") { _, _ -> viewModel.editMessage(message, input.text.toString()) }.show()
    }

    private fun showThreadDialog(message: Message) { /* Open thread */ }

    override fun onDestroyView() {
        super.onDestroyView()
        viewModel.stopPolling()
        mediaRecorder?.release()
    }
}
