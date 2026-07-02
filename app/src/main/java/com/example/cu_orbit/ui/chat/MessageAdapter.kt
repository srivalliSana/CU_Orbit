package com.example.cu_orbit.ui.chat

import android.view.ContextThemeWrapper
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import com.example.cu_orbit.R
import com.example.cu_orbit.data.Message
import com.example.cu_orbit.utils.MarkdownUtils
import com.google.android.material.chip.Chip
import com.google.android.material.chip.ChipGroup
import com.google.android.material.R as MaterialR
import com.google.android.material.imageview.ShapeableImageView
import coil.load
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MessageAdapter(
    private val messages: List<Message>,
    private val onMessageLongClick: (Message) -> Unit = {},
    private val onThreadClick: (Message) -> Unit = {},
    private val onReactionClick: (Message, String) -> Unit = { _, _ -> }
) :
    RecyclerView.Adapter<MessageAdapter.MessageViewHolder>() {

    private val timeFormatter = SimpleDateFormat("h:mm a", Locale.getDefault())
    private var mediaPlayer: android.media.MediaPlayer? = null
    private var playingMessageId: String? = null
    private var currentUserId: String = ""

    fun setCurrentUserId(userId: String) {
        this.currentUserId = userId
    }

    class MessageViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val headerLayout: View = view.findViewById(R.id.layout_message_header)
        val userName: TextView = view.findViewById(R.id.text_user_name)
        val timestamp: TextView = view.findViewById(R.id.text_timestamp)
        val body: TextView = view.findViewById(R.id.text_message_body)
        
        init {
            body.movementMethod = android.text.method.LinkMovementMethod.getInstance()
        }

        val profileImage: ShapeableImageView = view.findViewById(R.id.image_profile)
        val threadIndicator: View = view.findViewById(R.id.layout_thread_indicator)
        val threadCount: TextView = view.findViewById(R.id.text_thread_count)
        val reactionGroup: ChipGroup = view.findViewById(R.id.chip_group_reactions)
        
        // Media Views
        val cardImage: View = view.findViewById(R.id.card_message_image)
        val imageContent: android.widget.ImageView = view.findViewById(R.id.image_message_content)
        val cardVoice: View = view.findViewById(R.id.card_voice_player)
        val voicePlayButton: android.widget.ImageView = view.findViewById(R.id.button_play_voice)
        val voiceDuration: TextView = view.findViewById(R.id.text_voice_duration)
        val layoutFile: View = view.findViewById(R.id.layout_file_attachment)
        val fileName: TextView = view.findViewById(R.id.text_file_name)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): MessageViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_message, parent, false)
        return MessageViewHolder(view)
    }

    override fun onBindViewHolder(holder: MessageViewHolder, position: Int) {
        val message = messages[position]
        
        // Grouping logic: Hide header if previous message is from same user
        val showHeader = if (position == 0) {
            true
        } else {
            val prevMessage = messages[position - 1]
            // If same sender and within 5 minutes, group them
            prevMessage.senderId != message.senderId || (message.timestamp - prevMessage.timestamp > 300000)
        }

        if (showHeader) {
            holder.headerLayout.visibility = View.VISIBLE
            holder.userName.text = message.senderName ?: "Student"
            holder.timestamp.text = timeFormatter.format(Date(message.timestamp))
            
            // Try to resolve sender avatar
            val avatarUrl = message.senderAvatarUrl 
            if (avatarUrl != null && avatarUrl.isNotEmpty()) {
                holder.profileImage.load(avatarUrl) {
                    crossfade(true)
                    placeholder(R.drawable.ic_person)
                    error(R.drawable.ic_person)
                }
            } else {
                holder.profileImage.setImageResource(R.drawable.ic_person)
            }
        } else {
            holder.headerLayout.visibility = View.GONE
        }

        // WhatsApp-style status checkmarks
        if (message.senderId == currentUserId) {
            holder.timestamp.setCompoundDrawablesWithIntrinsicBounds(0, 0, 
                if (message.status == "read") android.R.drawable.checkbox_on_background else android.R.drawable.checkbox_off_background, 0)
        } else {
            holder.timestamp.setCompoundDrawablesWithIntrinsicBounds(0, 0, 0, 0)
        }

        holder.itemView.setOnLongClickListener {
            onMessageLongClick(message)
            true
        }

        // Reset media views
        holder.cardImage.visibility = View.GONE
        holder.cardVoice.visibility = View.GONE
        holder.layoutFile.visibility = View.GONE
        holder.body.visibility = View.VISIBLE

        val type = message.type ?: "text"
        android.util.Log.d("MessageAdapter", "Msg ID: ${message.id} Type: $type Body: ${message.body}")
        
        when (type) {
            "text" -> {
                holder.body.text = MarkdownUtils.formatMarkdown(message.body)
            }
            "image" -> {
                holder.body.visibility = if (message.body.isNullOrEmpty()) View.GONE else View.VISIBLE
                holder.body.text = MarkdownUtils.formatMarkdown(message.body)
                holder.cardImage.visibility = View.VISIBLE
                
                message.mediaUrl?.let { url ->
                    val imageUri = when {
                        url.startsWith("content://") -> android.net.Uri.parse(url)
                        url.startsWith("/") -> android.net.Uri.fromFile(java.io.File(url))
                        else -> android.net.Uri.parse(url)
                    }
                    holder.imageContent.load(imageUri) {
                        crossfade(true)
                        placeholder(R.drawable.bg_orbit_gradient)
                        error(R.drawable.bg_orbit_gradient)
                    }
                    
                    holder.cardImage.setOnClickListener {
                        val intent = android.content.Intent(holder.itemView.context, FullImageActivity::class.java).apply {
                            putExtra("IMAGE_URL", url)
                        }
                        holder.itemView.context.startActivity(intent)
                    }
                }
            }
            "voice" -> {
                holder.body.visibility = View.GONE
                holder.cardVoice.visibility = View.VISIBLE
                holder.voiceDuration.text = message.body
                
                val isPlaying = playingMessageId == message.id
                holder.voicePlayButton.setImageResource(
                    if (isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play
                )

                holder.voicePlayButton.setOnClickListener {
                    if (playingMessageId == message.id) {
                        stopPlayback(holder)
                    } else {
                        startPlayback(holder, message)
                    }
                }
            }
            "file" -> {
                holder.body.visibility = View.GONE
                holder.layoutFile.visibility = View.VISIBLE
                holder.fileName.text = message.body
                
                holder.layoutFile.setOnClickListener {
                    message.mediaUrl?.let { url ->
                        val fileUri = when {
                            url.startsWith("http") -> android.net.Uri.parse(url)
                            url.startsWith("content://") -> android.net.Uri.parse(url)
                            url.startsWith("/") -> android.net.Uri.fromFile(java.io.File(url))
                            else -> android.net.Uri.parse(url)
                        }
                        
                        if (url.startsWith("http")) {
                            // Open in browser for cloud files
                            val browserIntent = android.content.Intent(android.content.Intent.ACTION_VIEW, fileUri)
                            holder.itemView.context.startActivity(browserIntent)
                        } else {
                            openMedia(holder.itemView.context, fileUri, "*/*")
                        }
                    }
                }
            }
        }

        // Reactions
        holder.reactionGroup.removeAllViews()
        if (message.reactions?.isNotEmpty() == true) {
            holder.reactionGroup.visibility = View.VISIBLE
            val reactionCounts = message.reactions.groupBy { it.emoji }
            reactionCounts.forEach { (emoji, list) ->
                val chip = Chip(ContextThemeWrapper(holder.itemView.context, MaterialR.style.Widget_Material3_Chip_Suggestion), null, 0).apply {
                    text = "$emoji ${list.size}"
                    setOnClickListener { onReactionClick(message, emoji) }
                }
                holder.reactionGroup.addView(chip)
            }
        } else {
            holder.reactionGroup.visibility = View.GONE
        }
        
        // Threading
        if (message.replyCount > 0 && message.parentMessageId == null) {
            holder.threadIndicator.visibility = View.VISIBLE
            holder.threadCount.text = "${message.replyCount} replies"
            holder.threadIndicator.setOnClickListener { onThreadClick(message) }
        } else {
            holder.threadIndicator.visibility = View.GONE
        }
    }

    private fun startPlayback(holder: MessageViewHolder, message: Message) {
        val url = message.mediaUrl ?: return
        
        stopPlayback() // Stop any current playback

        mediaPlayer = android.media.MediaPlayer().apply {
            try {
                if (url.startsWith("http")) {
                    setDataSource(url)
                } else {
                    val audioUri = when {
                        url.startsWith("content://") -> android.net.Uri.parse(url)
                        url.startsWith("/") -> android.net.Uri.fromFile(java.io.File(url))
                        else -> android.net.Uri.parse(url)
                    }
                    setDataSource(holder.itemView.context, audioUri)
                }
                prepare()
                start()
                playingMessageId = message.id
                holder.voicePlayButton.setImageResource(android.R.drawable.ic_media_pause)
                
                setOnCompletionListener {
                    stopPlayback()
                    notifyDataSetChanged() // Refresh UI to reset play icons
                }
            } catch (e: Exception) {
                e.printStackTrace()
                Toast.makeText(holder.itemView.context, "Playback error", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun stopPlayback(holder: MessageViewHolder? = null) {
        mediaPlayer?.release()
        mediaPlayer = null
        playingMessageId = null
        holder?.voicePlayButton?.setImageResource(android.R.drawable.ic_media_play)
        if (holder == null) notifyDataSetChanged()
    }

    private fun openMedia(context: android.content.Context, uri: android.net.Uri, mimeType: String) {
        try {
            val shareUri = if (uri.scheme == "file" || uri.path?.startsWith("/") == true) {
                val file = if (uri.scheme == "file") java.io.File(uri.path!!) else java.io.File(uri.toString())
                androidx.core.content.FileProvider.getUriForFile(
                    context,
                    "com.example.cu_orbit.fileprovider",
                    file
                )
            } else {
                uri
            }

            val intent = android.content.Intent(android.content.Intent.ACTION_VIEW).apply {
                setDataAndType(shareUri, mimeType)
                addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            android.util.Log.e("MessageAdapter", "Error opening media", e)
            Toast.makeText(context, "No app found to open this file", Toast.LENGTH_SHORT).show()
        }
    }

    override fun getItemCount() = messages.size
}