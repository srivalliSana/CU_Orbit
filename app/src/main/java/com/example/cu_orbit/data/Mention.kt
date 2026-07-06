package com.example.cu_orbit.data

import com.google.gson.annotations.SerializedName

data class Mention(
    val id: String,
    @SerializedName("message_id") val messageId: String,
    @SerializedName("mentioned_user_id") val mentionedUserId: String,
    @SerializedName("source_channel_id") val sourceChannelId: String,
    @SerializedName("is_read") val isRead: Boolean = false
)
