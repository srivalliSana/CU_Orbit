package com.example.cu_orbit.data

import com.google.gson.annotations.SerializedName

data class Draft(
    val id: String,
    @SerializedName("user_id") val userId: String,
    @SerializedName("container_id") val containerId: String,
    val text: String,
    @SerializedName("updated_at") val updatedAt: Long
)
