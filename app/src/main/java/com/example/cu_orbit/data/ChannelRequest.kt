package com.example.cu_orbit.data

data class ChannelRequest(
    val name: String,
    val type: String, // "public" or "private"
    val description: String,
    val userId: String? = null
)
