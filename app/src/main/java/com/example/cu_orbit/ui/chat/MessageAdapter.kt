package com.example.cu_orbit.ui.chat

import android.os.Bundle
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
import com.example.cu_orbit.utils.MentionSpan
import com.google.android.material.chip.Chip
import com.google.android.material.chip.ChipGroup
import com.google.android.material.R as MaterialR
import com.google.android.material.imageview.ShapeableImageView
import coil.load
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import androidx.navigation.findNavController

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
        // Robust comparison: take last 10 digits to handle (+91) variations
        val senderClean = message.senderId.filter { it.isDigit() }.takeLast(10)
        val currentClean = currentUserId.filter { it.isDigit() }.takeLast(10)
        
        return if (senderClean.isNotEmpty() && senderClean == currentClean) {
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
                val context = holder.itemView.context
                val contactName = com.example.cu_orbit.utils.ContactUtils.getContactName(context, message.senderId)
                holder.userName?.text = contactName ?: message.senderName
                
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

        // --- Handle System Messages ---
        if (message.type == "system") {
            holder.body.visibility = View.VISIBLE
            holder.cardImage.visibility = View.GONE
            holder.cardVoice.visibility = View.GONE
            holder.layoutFile.visibility = View.GONE
            holder.reactionGroup.visibility = View.GONE
            holder.threadIndicator.visibility = View.GONE
            
            val context = holder.itemView.context
            val body = message.text ?: ""
            
            if (body.contains(":")) {
                val parts = body.split(":")
                val phone = parts[1]
                val contactName = com.example.cu_orbit.utils.ContactUtils.getContactName(context, phone)
                val displayName = contactName ?: phone
                
                holder.body.text = if (body.startsWith("ADD_MEMBER:")) {
                    "${message.senderName} added $displayName"
                } else {
                    "$displayName joined via invite link"
                }
                holder.body.setTypeface(null, android.graphics.Typeface.ITALIC)
                holder.body.setTextColor(androidx.core.content.ContextCompat.getColor(context, R.color.text_muted))
                holder.body.gravity = android.view.Gravity.CENTER
                holder.body.setPadding(0, 20, 0, 20)
            }
            return
        }

        // 3. Body & Markdown with Mention Highlighting
        val rawBody = message.text ?: ""
        val formattedBody = com.example.cu_orbit.utils.MarkdownUtils.formatMarkdown(rawBody, holder.itemView.context)

        // Highlight @mentions from metadata
        if (!message.enrichedMentions.isNullOrEmpty()) {
            val spannable = android.text.SpannableStringBuilder(formattedBody)
            // Sort by length descending to match longest names first (prevents partial matches)
            message.enrichedMentions.sortedByDescending { it.displayName.length }.forEach { mention ->
                val tag = "@${mention.displayName}"
                var index = spannable.toString().indexOf(tag)
                while (index != -1) {
                    val span = MentionSpan(
                        mention = mention,
                        color = androidx.core.content.ContextCompat.getColor(holder.itemView.context, R.color.orbit_primary)
                    ) { m ->
                        val bundle = Bundle().apply { putString("userId", m.userId) }
                        holder.itemView.findNavController().navigate(R.id.navigation_contact_info, bundle)
                    }
                    
                    spannable.setSpan(
                        span,
                        index,
                        index + tag.length,
                        android.text.Spannable.SPAN_EXCLUSIVE_EXCLUSIVE
                    )
                    index = spannable.toString().indexOf(tag, index + tag.length)
                }
            }
            holder.body.text = spannable
        } else {
            holder.body.text = formattedBody
        }

        holder.body.visibility = if (rawBody.isEmpty() && message.type != "text") View.GONE else View.VISIBLE

        // 4. Media views reset
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
