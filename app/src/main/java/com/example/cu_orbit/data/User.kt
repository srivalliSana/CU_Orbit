package com.example.cu_orbit.data

import com.google.gson.annotations.SerializedName

data class User(
    @SerializedName("id") val id: String,
    val phone: String = "",
    val name: String,
    val email: String = "",
    val avatarUrl: String = "",
    val status: String = "online",
    val statusEmoji: String = "",
    val bio: String = "Hey there! I am using CU Orbit.",
    val lastMessagePreview: String = "",
    val lastMessageTime: String = "",
    val unreadCount: Int = 0
)