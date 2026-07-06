package com.example.cu_orbit.data

import com.google.gson.annotations.SerializedName

data class User(
    @SerializedName("id") val id: String,
    val phone: String,
    val name: String,
    val handle: String,
    val email: String? = "",
    @SerializedName("avatar_url") val avatarUrl: String? = "",
    val bio: String? = "",
    @SerializedName("status_emoji") val statusEmoji: String? = "✨",
    @SerializedName("status_text") val statusText: String? = "",
    val presence: String = "offline",
    // Home feed summary fields (not in spec but helpful)
    val lastMessagePreview: String? = "",
    val lastMessageTime: String? = "",
    val unreadCount: Int = 0
)
