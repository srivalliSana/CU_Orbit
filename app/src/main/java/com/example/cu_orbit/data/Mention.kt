package com.example.cu_orbit.data

import com.google.gson.annotations.SerializedName

data class Mention(
    val id: String,
    @SerializedName("message_id") val messageId: String,
    @SerializedName("sender_id") val senderId: String,
    @SerializedName("sender_name") val senderName: String,
    val text: String,
    @SerializedName("sent_at") val sentAt: Long,
    @SerializedName("channel_id") val channelId: String,
    @SerializedName("channel_name") val channelName: String,
    @SerializedName("is_read") val isRead: Boolean = false
)
