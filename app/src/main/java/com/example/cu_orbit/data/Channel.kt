package com.example.cu_orbit.data

import com.google.gson.annotations.SerializedName

data class Channel(
    @SerializedName("id") val id: String,
    @SerializedName("workspace_id") val workspaceId: String,
    val name: String,
    val type: String = "public", // public | private
    val topic: String = "",
    @SerializedName("member_count") val memberCount: Int = 0,
    @SerializedName("unread_count") val unreadCount: Int = 0,
    @SerializedName("has_unread_mention") val hasUnreadMention: Boolean = false,
    @SerializedName("pinned_message_count") val pinnedMessageCount: Int = 0,
    @SerializedName("is_muted") val isMuted: Boolean = false,
    @SerializedName("invite_code") val inviteCode: String? = null,
    @SerializedName("created_by") val createdBy: String? = null,
    @SerializedName("last_message_preview") val lastMessagePreview: MessagePreview? = null,
    // WhatsApp-style Settings
    @SerializedName("restricted_messaging") val restrictedMessaging: Boolean = false,
    @SerializedName("info_edit_restricted") val infoEditRestricted: Boolean = false,
    @SerializedName("approval_required") val approvalRequired: Boolean = false
)

data class MessagePreview(
    @SerializedName("sender_id") val senderId: String? = null,
    @SerializedName("sender_name") val senderName: String? = null,
    @SerializedName("sender_is_self") val senderIsSelf: Boolean = false,
    val text: String? = "",
    @SerializedName("sent_at") val sentAt: Long,
    val type: String = "text"
)
