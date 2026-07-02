package com.example.cu_orbit.data

import com.google.gson.annotations.SerializedName

data class Workspace(
    @SerializedName("id") val id: String,
    val name: String,
    val description: String = "",
    val channels: List<Channel> = emptyList()
)