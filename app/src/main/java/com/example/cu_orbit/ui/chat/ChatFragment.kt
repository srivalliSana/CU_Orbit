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
        
        // Determine if it's a DM (ID is a phone number)
        val isDM = rawId.all { it.isDigit() || it == '+' }
        
        if (isDM) {
            // Generate a consistent DM ID: e.g., "12345_67890" sorted numerically
            // so both users always enter the same room.
            val otherUser = rawId
            channelId = if (currentUserId < otherUser) "${currentUserId}_$otherUser" else "${otherUser}_$currentUserId"
        } else {
            channelId = rawId
        }
        
        setupChatHeader(root, channelNameArg, isDM, rawId)

        root.findViewById<ImageButton>(R.id.button_back).setOnClickListener { findNavController().navigateUp() }

        root.findViewById<View>(R.id.layout_chat_header_info).setOnClickListener {
            val options = arrayOf("Contact/Channel Info", "Change Background")
            androidx.appcompat.app.AlertDialog.Builder(requireContext())
                .setItems(options) { _, which ->
                    if (which == 0) {
                        val bundle = Bundle().apply { putString("userId", arguments?.getString("channelId") ?: channelId) }
                        findNavController().navigate(R.id.navigation_contact_info, bundle)
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

        applyChatBackground(root)
        observeViewModel(root)
        viewModel.startPolling(channelId, currentUserId)
        setupInputArea(root)
        
        return root
    }

    private fun setupChatHeader(root: View, nameArg: String, isDM: Boolean, rawId: String) {
        val titleText: TextView = root.findViewById(R.id.text_chat_title)
        val subtitleText: TextView = root.findViewById(R.id.text_chat_subtitle)
        val btnAdd: ImageView = root.findViewById(R.id.button_add_member)

        if (isDM) {
            // Resolve contact name from phone number (rawId is the other person's phone)
            val resolvedName = ContactUtils.getContactName(requireContext(), rawId)
            channelName = resolvedName ?: rawId 
            titleText.text = channelName
            
            // Set dynamic status
            lifecycleScope.launch {
                try {
                    val users = repository.getUsers()
                    val otherUser = users.find { it.phone == rawId || it.id == rawId }
                    subtitleText.text = otherUser?.status ?: "online"
                } catch (e: Exception) {
                    subtitleText.text = "online"
                }
            }
            btnAdd.visibility = View.GONE 
        } else {
            channelName = nameArg
            titleText.text = "#$channelName"
            btnAdd.visibility = View.VISIBLE
            btnAdd.setOnClickListener { showAddMemberDialog() }
            
            lifecycleScope.launch {
                try {
                    val channel = repository.getChannel(channelId)
                    val count = channel.memberCount ?: 0
                    subtitleText.text = if (count > 0) "$count members" else "0 members"
                } catch (e: Exception) {
                    subtitleText.text = ""
                }
            }
        }
    }

    private fun showAddMemberDialog() {
        val input = EditText(requireContext()).apply { hint = "Phone number" }
        androidx.appcompat.app.AlertDialog.Builder(requireContext())
            .setTitle("Add Member")
            .setView(input)
            .setPositiveButton("Add") { _, _ ->
                val phone = input.text.toString().trim()
                if (phone.isNotEmpty()) {
                    lifecycleScope.launch {
                        try {
                            repository.addChannelMember(channelId, phone)
                            Toast.makeText(context, "Added!", Toast.LENGTH_SHORT).show()
                        } catch (e: Exception) {
                            Toast.makeText(context, "Error adding member", Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun observeViewModel(root: View) {
        val typingText: TextView = root.findViewById(R.id.text_typing_indicator)
        viewModel.typingUsers.observe(viewLifecycleOwner) { users ->
            val otherTyping = users.filter { it.userId != currentUserId }
            if (otherTyping.isNotEmpty()) {
                typingText.visibility = View.VISIBLE
                typingText.text = if (otherTyping.size == 1) "${otherTyping[0].userName} is typing..." else "Multiple people are typing..."
            } else {
                typingText.visibility = View.GONE
            }
        }

        viewModel.messages.observe(viewLifecycleOwner) { messages ->
            val oldSize = messagesList.size
            messagesList.clear()
            messagesList.addAll(messages)
            adapter.notifyDataSetChanged()
            if (messages.size > oldSize) {
                root.findViewById<RecyclerView>(R.id.recycler_messages)?.scrollToPosition(messagesList.size - 1)
            }
        }
    }

    private fun setupInputArea(root: View) {
        val editMessage: EditText = root.findViewById(R.id.edit_message)
        val buttonSend: ImageButton = root.findViewById(R.id.button_send)
        val buttonMic: ImageView = root.findViewById(R.id.button_mic)

        editMessage.addTextChangedListener { viewModel.updateTyping(channelId, currentUserId, currentUserName) }

        buttonSend.setOnClickListener {
            val text = editMessage.text.toString().trim()
            if (text.isNotEmpty()) {
                sendMessage(text)
                editMessage.setText("")
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
            Toast.makeText(context, "Search within chat coming soon!", Toast.LENGTH_SHORT).show()
        }
    }

    private var recordingStartTime = 0L

    private fun startRecording() {
        recordingStartTime = System.currentTimeMillis()
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
                Toast.makeText(context, "Recording started...", Toast.LENGTH_SHORT).show()
            } catch (e: IOException) {
                Toast.makeText(context, "Error starting recorder", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun stopRecording() {
        try {
            if (System.currentTimeMillis() - recordingStartTime < 1000) {
                // If recording is too short, just cancel it
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
        viewModel.sendMessage(currentUserId, currentUserName, text, channelId, type, mediaUrl, senderAvatarUrl = avatarUrl)
    }

    private fun applyChatBackground(root: View) {
        val prefs = requireContext().getSharedPreferences("CU_ORBIT_BG", android.content.Context.MODE_PRIVATE)
        val color = prefs.getInt("bg_$channelId", -1)
        val uriString = prefs.getString("bg_uri_$channelId", null)
        val bgImage: ImageView = root.findViewById(R.id.image_chat_background)
        val recyclerView: RecyclerView = root.findViewById(R.id.recycler_messages)

        // Reset
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
        val input = EditText(requireContext()).apply { setText(message.body) }
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
        // Hide keyboard to prevent "inactive InputConnection" warnings
        val imm = requireContext().getSystemService(android.content.Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
        view?.windowToken?.let { imm.hideSoftInputFromWindow(it, 0) }

        viewModel.stopPolling()
    }
}