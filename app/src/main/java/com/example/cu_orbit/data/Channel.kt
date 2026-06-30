package com.example.cu_orbit.data

import com.google.gson.annotations.SerializedName

data class Channel(
    @SerializedName("id") val id: String,
    val name: String,
    val isPrivate: Boolean = false,
    val description: String = "",
    val memberCount: Int = 0,
    val lastMessagePreview: String = "",
    val lastMessageTime: String = "",
    val unreadCount: Int = 0
)