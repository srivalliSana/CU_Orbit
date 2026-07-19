package com.example.cu_orbit.data

import com.google.gson.annotations.SerializedName

data class MentionMetadata(
    @SerializedName("display_name") val displayName: String,
    @SerializedName("user_id") val userId: String,
    @SerializedName("platform_user_id") val platformUserId: String? = null,
    // Nullable since SSO: mentions are resolved by userId, and CampusOne
    // accounts have no phone number.
    val phone: String? = null,
    @SerializedName("should_notify") val shouldNotify: Boolean = true
)
