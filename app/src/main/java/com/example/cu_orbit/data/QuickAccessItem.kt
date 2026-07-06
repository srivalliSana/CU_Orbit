package com.example.cu_orbit.data

data class QuickAccessItem(
    val id: String,
    val label: String,
    val iconRes: Int,
    val count: Int,
    val isUrgent: Boolean = false
)
