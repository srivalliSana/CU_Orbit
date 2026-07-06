package com.example.cu_orbit.data

data class ChannelRequest(
    val name: String,
    val isPrivate: Boolean,
    val description: String,
    val userId: String? = null
)
