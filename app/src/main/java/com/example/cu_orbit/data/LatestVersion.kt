package com.example.cu_orbit.data

import com.google.gson.annotations.SerializedName

/** GET /api/system/latest-version */
data class LatestVersion(
    val available: Boolean = false,
    val version: String? = null,
    @SerializedName("build_number") val buildNumber: Int? = null,
    @SerializedName("download_url") val downloadUrl: String? = null,
    @SerializedName("released_at") val releasedAt: String? = null
)
