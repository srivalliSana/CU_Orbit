package com.example.cu_orbit.data

data class ActivityItem(
    val id: String,
    val type: String, // mention | thread | reaction
    val title: String,
    val body: String,
    val timestamp: Long,
    val sourceName: String,
    val isRead: Boolean = false,
    val emoji: String? = null,
    val messageId: String? = null
)
