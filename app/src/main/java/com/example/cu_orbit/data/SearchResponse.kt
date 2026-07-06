package com.example.cu_orbit.data

data class SearchResponse(
    val channels: List<Channel>,
    val users: List<User>,
    val messages: List<Message>
)
