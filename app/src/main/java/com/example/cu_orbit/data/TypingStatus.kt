package com.example.cu_orbit.data

data class TypingStatus(
    val channelId: String,
    val userId: String,
    val userName: String,
    val lastTypedAt: Long
)