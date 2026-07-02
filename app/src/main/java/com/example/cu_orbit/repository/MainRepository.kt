package com.example.cu_orbit.repository

import com.example.cu_orbit.data.Channel
import com.example.cu_orbit.data.ChannelRequest
import com.example.cu_orbit.data.Message
import com.example.cu_orbit.data.MessageRequest
import com.example.cu_orbit.data.User
import com.example.cu_orbit.network.RetrofitClient
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.asRequestBody

class MainRepository {
    private val api = RetrofitClient.instance

    suspend fun getChannels(): List<Channel> = api.getChannels()

    suspend fun getChannel(id: String): Channel = api.getChannel(id)

    suspend fun createChannel(name: String, isPrivate: Boolean, description: String): Channel {
        return api.createChannel(ChannelRequest(name, isPrivate, description))
    }

    suspend fun addChannelMember(channelId: String, userId: String) =
        api.addChannelMember(channelId, mapOf("userId" to userId))

    suspend fun updateTyping(channelId: String, userId: String, userName: String) = 
        api.updateTyping(channelId, mapOf("userId" to userId, "userName" to userName))

    suspend fun getTyping(channelId: String) = api.getTyping(channelId)

    suspend fun getWorkspaces() = api.getWorkspaces()
    
    suspend fun createWorkspace(name: String, description: String) = 
        api.createWorkspace(ChannelRequest(name, false, description))

    suspend fun getWorkspaceChannels(workspaceId: String) = api.getWorkspaceChannels(workspaceId)
    
    suspend fun createWorkspaceChannel(workspaceId: String, name: String, isPrivate: Boolean, description: String) =
        api.createWorkspaceChannel(workspaceId, ChannelRequest(name, isPrivate, description))

    suspend fun getStatuses() = api.getStatuses()

    suspend fun postStatus(userId: String, userName: String, type: String, mediaUrl: String, caption: String?) =
        api.postStatus(mapOf("userId" to userId, "userName" to userName, "type" to type, "mediaUrl" to mediaUrl, "caption" to caption))

    suspend fun getMessages(channelId: String): List<Message> = api.getMessages(channelId)

    suspend fun getReplies(messageId: String): List<Message> = api.getReplies(messageId)

    suspend fun sendMessage(message: MessageRequest): Message = api.sendMessage(message)

    suspend fun deleteMessage(id: String) = api.deleteMessage(id)

    suspend fun editMessage(id: String, newBody: String? = null, status: String? = null) = 
        api.editMessage(id, mapOf("body" to newBody, "status" to status).filterValues { it != null } as Map<String, String>)

    suspend fun reactToMessage(messageId: String, userId: String, userName: String, emoji: String) =
        api.reactToMessage(messageId, mapOf("userId" to userId, "userName" to userName, "emoji" to emoji))

    suspend fun getUsers(): List<User> = api.getUsers()

    suspend fun getInbox(userId: String): List<User> = api.getInbox(userId)

    suspend fun updateUser(phone: String, name: String? = null, bio: String? = null, avatarUrl: String? = null) =
        api.updateUser(phone, mapOf("name" to name, "bio" to bio, "avatarUrl" to avatarUrl).filterValues { it != null })

    suspend fun uploadFile(file: java.io.File): String {
        val mediaType = "multipart/form-data".toMediaTypeOrNull()
        val requestFile = file.asRequestBody(mediaType)
        val body = okhttp3.MultipartBody.Part.createFormData("file", file.name, requestFile)
        val response = api.uploadFile(body)
        val path = response["url"] ?: ""
        
        // Convert relative path to absolute using current baseUrl
        return if (path.startsWith("/")) {
            RetrofitClient.baseUrl.replace("/api/", "") + path
        } else {
            path
        }
    }

    fun getPrefs(context: android.content.Context): android.content.SharedPreferences {
        return context.getSharedPreferences("CU_ORBIT_PREFS", android.content.Context.MODE_PRIVATE)
    }
}