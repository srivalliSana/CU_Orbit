package com.example.cu_orbit.repository

import com.example.cu_orbit.data.*
import com.example.cu_orbit.network.RetrofitClient
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.asRequestBody

class MainRepository {
    private val api = RetrofitClient.instance

    suspend fun getHomeFeed(userId: String, workspaceId: String) = api.getHomeFeed(userId, workspaceId)
    
    suspend fun getQuickAccessCounts(userId: String) = api.getQuickAccessCounts(userId)

    suspend fun getWorkspaces() = api.getWorkspaces()
    
    suspend fun createWorkspace(name: String, description: String) = 
        api.createWorkspace(mapOf("name" to name, "description" to description))

    suspend fun createChannel(name: String, isPrivate: Boolean, description: String, userId: String? = null): Channel {
        val wsList = getWorkspaces()
        val wsId = if (wsList.isNotEmpty()) wsList[0].id else "" 
        val type = if (isPrivate) "private" else "public"
        return api.createWorkspaceChannel(wsId, ChannelRequest(name, type, description, userId))
    }

    suspend fun getWorkspaceChannels(workspaceId: String, userId: String? = null, type: String? = null) = api.getWorkspaceChannels(workspaceId, userId, type)
    
    suspend fun createWorkspaceChannel(workspaceId: String, name: String, isPrivate: Boolean, description: String, userId: String? = null): Channel {
        val type = if (isPrivate) "private" else "public"
        return api.createWorkspaceChannel(workspaceId, ChannelRequest(name, type, description, userId))
    }

    suspend fun getChannel(id: String): Channel = api.getChannel(id)
    
    suspend fun updateChannel(id: String, settings: Map<String, Any?>) = api.updateChannel(id, settings)

    suspend fun deleteChannel(channelId: String, userId: String) = api.deleteChannel(channelId, userId)

    suspend fun addChannelMember(channelId: String, phone: String, addedBy: String? = null, adderName: String? = null) =
        api.addChannelMember(channelId, mapOf("userId" to phone, "addedBy" to addedBy, "adderName" to adderName))

    suspend fun updateTyping(channelId: String, userId: String, userName: String) = 
        api.updateTyping(channelId, mapOf("userId" to userId, "userName" to userName))

    suspend fun getTyping(channelId: String) = api.getTyping(channelId)

    suspend fun getStatuses() = api.getStatuses()

    suspend fun postStatus(userId: String, userName: String, type: String, mediaUrl: String, caption: String?, mentions: List<String>? = null) =
        api.postStatus(mapOf(
            "userId" to userId, 
            "userName" to userName, 
            "type" to type, 
            "mediaUrl" to mediaUrl, 
            "caption" to caption,
            "mentions" to (mentions ?: emptyList())
        ))

    suspend fun getMessages(containerId: String): List<Message> = api.getMessages(containerId)

    suspend fun sendMessage(message: MessageRequest): Message = api.sendMessage(message)

    suspend fun editMessage(id: String, newBody: String? = null, status: String? = null) = 
        api.editMessage(id, mapOf("body" to newBody, "status" to status))

    suspend fun reactToMessage(messageId: String, userId: String, userName: String, emoji: String) =
        api.reactToMessage(messageId, mapOf("userId" to userId, "userName" to userName, "emoji" to emoji))

    suspend fun deleteMessage(id: String) = api.deleteMessage(id)

    suspend fun getReplies(messageId: String): List<Message> {
        // api.getReplies(messageId)
        return emptyList()
    }

    suspend fun getUsers(): List<User> = api.getUsers()

    suspend fun getInbox(userId: String): List<User> = api.getInbox(userId)

    suspend fun updateUser(phone: String, name: String? = null, bio: String? = null, avatarUrl: String? = null, statusEmoji: String? = null, statusText: String? = null) {
        val cleanPhone = phone.replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
        api.updateUser(cleanPhone, mapOf(
            "name" to name, 
            "bio" to bio, 
            "avatarUrl" to avatarUrl,
            "status_emoji" to statusEmoji,
            "status_text" to statusText
        ).filterValues { it != null })
    }

    suspend fun getUser(userId: String): User = api.getUser(userId)

    suspend fun getChannelMembers(channelId: String) = api.getChannelMembers(channelId)

    suspend fun removeChannelMember(channelId: String, userId: String) = api.removeChannelMember(channelId, userId)

    suspend fun updateMemberRole(channelId: String, userId: String, role: String) = 
        api.updateMemberRole(channelId, userId, mapOf("role" to role))

    suspend fun joinChannelByLink(inviteCode: String, userId: String) =
        api.joinChannelByLink(mapOf("inviteCode" to inviteCode, "userId" to userId))

    suspend fun updateConversationPrefs(id: String, userId: String, action: String, value: String) =
        api.updateConversationPrefs(id, mapOf("userId" to userId, "action" to action, "value" to value))

    suspend fun markAllRead(userId: String) =
        api.markAllRead(mapOf("userId" to userId))

    suspend fun getMentions(userId: String): List<Mention> = api.getMentions(userId)
    
    suspend fun markMentionAsRead(id: String) = api.markMentionAsRead(id)

    suspend fun markAllMentionsAsRead(userId: String, containerId: String) = 
        api.markAllMentionsAsRead(mapOf("userId" to userId, "containerId" to containerId))

    suspend fun search(query: String, userId: String, workspaceId: String) =
        api.search(query, userId, workspaceId)

    suspend fun uploadFile(file: java.io.File): String {
        val mediaType = "multipart/form-data".toMediaTypeOrNull()
        val requestFile = file.asRequestBody(mediaType)
        val body = okhttp3.MultipartBody.Part.createFormData("file", file.name, requestFile)
        val response = api.uploadFile(body)
        return response["url"] ?: ""
    }

    fun getPrefs(context: android.content.Context): android.content.SharedPreferences {
        return context.getSharedPreferences("CU_ORBIT_PREFS", android.content.Context.MODE_PRIVATE)
    }
}
