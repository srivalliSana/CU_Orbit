package com.example.cu_orbit.data

import com.google.gson.annotations.SerializedName

data class Workspace(
    @SerializedName("id") val id: String,
    val name: String,
    val slug: String,
    @SerializedName("icon_url") val iconUrl: String? = "",
    @SerializedName("member_count") val memberCount: Int = 0,
    var isActive: Boolean = false
)
