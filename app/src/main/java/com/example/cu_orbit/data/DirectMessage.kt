package com.example.cu_orbit.data

import com.google.gson.annotations.SerializedName

data class DirectMessage(
    @SerializedName("id") val id: String,
    @SerializedName("other_user_id") val otherUserId: String,
    @SerializedName("other_user_name") val otherUserName: String,
    @SerializedName("other_user_avatar_url") val otherUserAvatarUrl: String? = "",
    val presence: String = "offline", // online | away | dnd | offline
    @SerializedName("unread_count") val unreadCount: Int = 0,
    @SerializedName("is_muted") val isMuted: Boolean = false,
    @SerializedName("last_message_preview") val lastMessagePreview: MessagePreview? = null
)
