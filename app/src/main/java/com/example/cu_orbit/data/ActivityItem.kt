package com.example.cu_orbit.data

data class ActivityItem(
    val id: String,
    val type: String, // mention, reaction, thread
    val userName: String,
    val channelName: String,
    val messagePreview: String,
    val time: String
)