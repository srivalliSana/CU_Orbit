package com.example.cu_orbit.data

data class MessageRequest(
    val senderId: String,
    val senderName: String,
    val body: String,
    val channelId: String,
    val type: String = "text",
    val mediaUrl: String? = null,
    val parentMessageId: String? = null,
    val senderAvatarUrl: String? = null,
    val mentions: List<String>? = null, // List of phones for legacy
    val enrichedMentions: List<MentionMetadata>? = null
)