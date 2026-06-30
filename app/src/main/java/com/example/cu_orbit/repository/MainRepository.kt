package com.example.cu_orbit.repository

import com.example.cu_orbit.data.Channel
import com.example.cu_orbit.data.ChannelRequest
import com.example.cu_orbit.data.Message
import com.example.cu_orbit.data.MessageRequest
import com.example.cu_orbit.data.User
import com.example.cu_orbit.network.RetrofitClient

class MainRepository {
    private val api = RetrofitClient.instance

    suspend fun getChannels(): List<Channel> = api.getChannels()

    suspend fun createChannel(name: String, isPrivate: Boolean, description: String): Channel {
        return api.createChannel(ChannelRequest(name, isPrivate, description))
    }

    suspend fun addChannelMember(channelId: String, userId: String) =
        api.addChannelMember(channelId, mapOf("userId" to userId))

    suspend fun updateTyping(channelId: String, userId: String, userName: String) = 
        api.updateTyping(channelId, mapOf("userId" to userId, "userName" to userName))

    suspend fun getTyping(channelId: String) = api.getTyping(channelId)

    suspend fun getMessages(channelId: String): List<Message> = api.getMessages(channelId)

    suspend fun getReplies(messageId: String): List<Message> = api.getReplies(messageId)

    suspend fun sendMessage(message: MessageRequest): Message = api.sendMessage(message)

    suspend fun deleteMessage(id: String) = api.deleteMessage(id)

    suspend fun editMessage(id: String, newBody: String? = null, status: String? = null) = 
        api.editMessage(id, mapOf("body" to newBody, "status" to status).filterValues { it != null } as Map<String, String>)

    suspend fun reactToMessage(messageId: String, userId: String, userName: String, emoji: String) =
        api.reactToMessage(messageId, mapOf("userId" to userId, "userName" to userName, "emoji" to emoji))

    suspend fun getUsers(): List<User> = api.getUsers()

    fun getPrefs(context: android.content.Context): android.content.SharedPreferences {
        return context.getSharedPreferences("CU_ORBIT_PREFS", android.content.Context.MODE_PRIVATE)
    }
}