package com.example.cu_orbit.data

import com.google.gson.annotations.SerializedName

data class Status(
    @SerializedName("id") val id: String,
    val userId: String,
    val userName: String,
    val type: String, // image or video
    val mediaUrl: String,
    val caption: String?,
    val expiresAt: String,
    val createdAt: String
)