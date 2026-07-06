package com.example.cu_orbit.ui.chat

import android.view.ContextThemeWrapper
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.recyclerview.widget.RecyclerView
import com.example.cu_orbit.R
import com.example.cu_orbit.data.Message
import com.example.cu_orbit.network.RetrofitClient
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

    companion object {
        private const val TYPE_SENT = 1
        private const val TYPE_RECEIVED = 2
    }

    fun setCurrentUserId(userId: String) {
        this.currentUserId = userId
        notifyDataSetChanged()
    }

    override fun getItemViewType(position: Int): Int {
        val message = messages[position]
        // Robust comparison: extract digits only to handle (+91) variations
        val senderDigits = message.senderId.filter { it.isDigit() }
        val currentDigits = currentUserId.filter { it.isDigit() }
        
        return if (senderDigits.isNotEmpty() && senderDigits == currentDigits) {
            TYPE_SENT
        } else {
            TYPE_RECEIVED
        }
    }

    class MessageViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        // Shared fields
        val timestamp: TextView = view.findViewById(R.id.text_timestamp)
        val body: TextView = view.findViewById(R.id.text_message_body)
        val threadIndicator: View = view.findViewById(R.id.layout_thread_indicator)
        val threadCount: TextView = view.findViewById(R.id.text_thread_count)
        val reactionGroup: ChipGroup = view.findViewById(R.id.chip_group_reactions)
        val cardImage: View = view.findViewById(R.id.card_message_image)
        val imageContent: ImageView = view.findViewById(R.id.image_message_content)
        val cardVoice: View = view.findViewById(R.id.card_voice_player)
        val voicePlayButton: ImageView = view.findViewById(R.id.button_play_voice)
        val voiceDuration: TextView = view.findViewById(R.id.text_voice_duration)
        val layoutFile: View = view.findViewById(R.id.layout_file_attachment)
        val fileName: TextView = view.findViewById(R.id.text_file_name)

        // Received message only
        val headerLayout: View? = view.findViewById(R.id.layout_message_header)
        val userName: TextView? = view.findViewById(R.id.text_user_name)
        val profileImage: ShapeableImageView? = view.findViewById(R.id.image_profile)
        
        // Sent message only
        val statusIcon: ImageView? = view.findViewById(R.id.image_message_status)

        init {
            body.movementMethod = android.text.method.LinkMovementMethod.getInstance()
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): MessageViewHolder {
        val layout = if (viewType == TYPE_SENT) R.layout.item_message_sent else R.layout.item_message_received
        val view = LayoutInflater.from(parent.context).inflate(layout, parent, false)
        return MessageViewHolder(view)
    }

    override fun onBindViewHolder(holder: MessageViewHolder, position: Int) {
        val message = messages[position]
        val isSent = getItemViewType(position) == TYPE_SENT
        
        // 1. Timestamp
        holder.timestamp.text = timeFormatter.format(Date(message.sentAt))
        holder.timestamp.setCompoundDrawablesWithIntrinsicBounds(0, 0, 0, 0)

        // 2. Received Message Header & Avatar logic
        if (!isSent) {
            val showHeader = if (position == 0) true 
            else {
                val prev = messages[position - 1]
                prev.senderId != message.senderId || (message.sentAt - prev.sentAt > 300000)
            }

            if (showHeader) {
                holder.headerLayout?.visibility = View.VISIBLE
                holder.userName?.text = message.senderName
                
                val avatarUrl = RetrofitClient.getAbsoluteUrl(message.senderAvatarUrl)
                if (!avatarUrl.isNullOrEmpty()) {
                    holder.profileImage?.load(avatarUrl) {
                        crossfade(true)
                        placeholder(R.drawable.ic_person)
                        error(R.drawable.ic_person)
                    }
                } else {
                    holder.profileImage?.setImageResource(R.drawable.ic_person)
                }
            } else {
                holder.headerLayout?.visibility = View.GONE
            }
        } else {
            holder.statusIcon?.visibility = View.VISIBLE
            
            // WhatsApp-style logic:
            // 1. Sent/Offline -> Single Tick (Grey)
            // 2. Online/Delivered -> Double Tick (Grey)
            // 3. Read -> Double Tick (Blue)
            
            when (message.status) {
                "read" -> {
                    holder.statusIcon?.setImageResource(R.drawable.ic_tick_double)
                    holder.statusIcon?.colorFilter = android.graphics.PorterDuffColorFilter(
                        android.graphics.Color.parseColor("#34B7F1"), // WhatsApp Blue
                        android.graphics.PorterDuff.Mode.SRC_IN
                    )
                }
                "delivered" -> {
                    holder.statusIcon?.setImageResource(R.drawable.ic_tick_double)
                    holder.statusIcon?.colorFilter = android.graphics.PorterDuffColorFilter(
                        android.graphics.Color.GRAY,
                        android.graphics.PorterDuff.Mode.SRC_IN
                    )
                }
                else -> { // "sent" or default
                    holder.statusIcon?.setImageResource(R.drawable.ic_tick_single)
                    holder.statusIcon?.colorFilter = android.graphics.PorterDuffColorFilter(
                        android.graphics.Color.GRAY,
                        android.graphics.PorterDuff.Mode.SRC_IN
                    )
                }
            }
            holder.statusIcon?.alpha = 0.8f
        }

        // 3. Body & Markdown
        holder.body.text = MarkdownUtils.formatMarkdown(message.text ?: "")
        holder.body.visibility = if (message.text.isNullOrEmpty() && message.type != "text") View.GONE else View.VISIBLE

        // 4. Media Views Reset
        holder.cardImage.visibility = View.GONE
        holder.cardVoice.visibility = View.GONE
        holder.layoutFile.visibility = View.GONE

        // 5. Media Logic
        when (message.type) {
            "image" -> {
                holder.cardImage.visibility = View.VISIBLE
                val attachment = message.attachments?.find { it.type == "image" }
                val url = RetrofitClient.getAbsoluteUrl(attachment?.url)
                url?.let {
                    holder.imageContent.load(it) {
                        crossfade(true)
                        placeholder(R.drawable.bg_orbit_gradient)
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
                holder.cardVoice.visibility = View.VISIBLE
                holder.voiceDuration.text = "Voice Message"
                val isPlaying = playingMessageId == message.id
                holder.voicePlayButton.setImageResource(
                    if (isPlaying) android.R.drawable.ic_media_pause else android.R.drawable.ic_media_play
                )
                val attachment = message.attachments?.find { it.type == "voice" }
                val voiceUrl = RetrofitClient.getAbsoluteUrl(attachment?.url)
                holder.voicePlayButton.setOnClickListener {
                    voiceUrl?.let { url ->
                        if (playingMessageId == message.id) stopPlayback(holder) else startPlayback(holder, message, url)
                    }
                }
            }
            "file" -> {
                holder.layoutFile.visibility = View.VISIBLE
                val fileAttachment = message.attachments?.find { it.type == "file" }
                holder.fileName.text = fileAttachment?.filename ?: "Attachment"
                holder.layoutFile.setOnClickListener {
                    fileAttachment?.url?.let { url ->
                        try {
                            val browserIntent = android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url))
                            holder.itemView.context.startActivity(browserIntent)
                        } catch (e: Exception) {}
                    }
                }
            }
        }

        // 6. Reactions
        holder.reactionGroup.removeAllViews()
        val reactions = message.reactions
        if (!reactions.isNullOrEmpty()) {
            holder.reactionGroup.visibility = View.VISIBLE
            reactions.groupBy { it.emoji }.forEach { (emoji, list) ->
                val chip = Chip(ContextThemeWrapper(holder.itemView.context, MaterialR.style.Widget_Material3_Chip_Suggestion), null, 0).apply {
                    text = "$emoji ${list.size}"
                    setOnClickListener { onReactionClick(message, emoji) }
                }
                holder.reactionGroup.addView(chip)
            }
        } else {
            holder.reactionGroup.visibility = View.GONE
        }
        
        // 7. Threading
        if (message.threadReplyCount > 0 && (message.channelId != null || message.dmId != null)) {
            holder.threadIndicator.visibility = View.VISIBLE
            holder.threadCount.text = "${message.threadReplyCount} replies"
            holder.threadIndicator.setOnClickListener { onThreadClick(message) }
        } else {
            holder.threadIndicator.visibility = View.GONE
        }

        holder.itemView.setOnLongClickListener {
            onMessageLongClick(message)
            true
        }
    }

    private fun startPlayback(holder: MessageViewHolder, message: Message, url: String) {
        stopPlayback()
        mediaPlayer = android.media.MediaPlayer().apply {
            try {
                setDataSource(url)
                prepare()
                start()
                playingMessageId = message.id
                holder.voicePlayButton.setImageResource(android.R.drawable.ic_media_pause)
                setOnCompletionListener { stopPlayback(); notifyDataSetChanged() }
            } catch (e: Exception) {
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

    override fun getItemCount() = messages.size
}
