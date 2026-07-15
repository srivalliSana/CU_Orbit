package com.example.cu_orbit.data

import com.google.gson.annotations.SerializedName

data class Message(
    @SerializedName("id") val id: String,
    @SerializedName("channel_id") val channelId: String? = null,
    @SerializedName("dm_id") val dmId: String? = null,
    @SerializedName("sender_id") val senderId: String,
    @SerializedName("sender_name") val senderName: String,
    @SerializedName("sender_avatar_url") val senderAvatarUrl: String? = null,
    val text: String? = "",
    @SerializedName("sent_at") val sentAt: Long,
    val type: String = "text",
    @SerializedName("edited_at") val editedAt: Long? = null,
    @SerializedName("thread_reply_count") val threadReplyCount: Int = 0,
    val reactions: List<Reaction>? = emptyList(),
    val attachments: List<Attachment>? = emptyList(),
    @SerializedName("is_pinned") val isPinned: Boolean = false,
    val status: String = "sent",
    @SerializedName("enriched_mentions") val enrichedMentions: List<MentionMetadata>? = null
)

data class Attachment(
    val type: String, // image | voice | file
    val url: String,
    val filename: String? = null,
    @SerializedName("duration_sec") val durationSec: Int? = null
)
