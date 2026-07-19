package com.example.cu_orbit.data

import com.google.gson.annotations.SerializedName

data class User(
    @SerializedName("id") val id: String,
    // Nullable since SSO: CampusOne accounts are keyed on campus_email and
    // carry no phone number. A non-null type here crashed on the first
    // account created through single sign-on.
    val phone: String? = null,
    @SerializedName("campus_email") val campusEmail: String? = null,
    val name: String = "",
    val handle: String? = null,
    val cohort: String? = null,
    val campus: String? = null,
    val email: String? = "",
    // Server returns avatarUrl (camelCase); the alternate spelling is kept for
    // responses that still use the snake_case form.
    @SerializedName(value = "avatarUrl", alternate = ["avatar_url"]) val avatarUrl: String? = "",
    val bio: String? = "",
    @SerializedName("status_emoji") val statusEmoji: String? = "✨",
    @SerializedName("status_text") val statusText: String? = "",
    val presence: String = "offline",
    val role: String? = "student",
    @SerializedName("slack_id") val slackId: String? = null,
    @SerializedName("discord_id") val discordId: String? = null,
    @SerializedName("telegram_handle") val telegramHandle: String? = null,
    // Home feed summary fields (not in spec but helpful)
    val lastMessagePreview: String? = "",
    val lastMessageTime: String? = "",
    val unreadCount: Int = 0
)
