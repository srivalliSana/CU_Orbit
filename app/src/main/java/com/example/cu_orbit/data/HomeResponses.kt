package com.example.cu_orbit.data

data class HomeFeedResponse(
    val channels: List<Channel>,
    val dms: List<DirectMessage>
)

data class QuickAccessResponse(
    val threads: Int,
    val mentions: Int,
    val drafts: Int
)
