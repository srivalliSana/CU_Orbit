package com.example.cu_orbit.data

import com.google.gson.annotations.SerializedName

data class Message(
    @SerializedName("id") val id: String,
    val senderId: String,
    val senderName: String,
    val body: String,
    val timestamp: Long,
    val channelId: String,
    val parentMessageId: String? = null,
    val replyCount: Int = 0,
    val reactions: List<Reaction>? = emptyList(),
    val type: String? = "text",
    val mediaUrl: String? = null,
    val status: String = "sent",
    val senderAvatarUrl: String? = null
)