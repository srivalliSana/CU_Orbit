package com.example.cu_orbit.network

import com.example.cu_orbit.data.Channel
import com.example.cu_orbit.data.ChannelRequest
import com.example.cu_orbit.data.Message
import com.example.cu_orbit.data.MessageRequest
import com.example.cu_orbit.data.Status
import com.example.cu_orbit.data.TypingStatus
import com.example.cu_orbit.data.User
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path

interface ApiService {
    // AUTH
    @POST("auth/login")
    suspend fun login(@Body body: Map<String, String>): Map<String, Any>

    @POST("auth/send-otp")
    suspend fun sendOtp(@Body body: Map<String, String>): Map<String, Any>

    @POST("auth/verify-otp")
    suspend fun verifyOtp(@Body body: Map<String, String>): Map<String, Any>

    @POST("auth/register")
    suspend fun register(@Body user: Map<String, String>): Map<String, Any>

    // CHANNELS
    @GET("channels")
    suspend fun getChannels(): List<Channel>

    @POST("channels")
    suspend fun createChannel(@Body body: ChannelRequest): Channel

    @GET("channels/{id}")
    suspend fun getChannel(@Path("id") id: String): Channel

    @POST("channels/{id}/members")
    suspend fun addChannelMember(@Path("id") channelId: String, @Body body: Map<String, String>): Map<String, Any>

    @POST("channels/{id}/typing")
    suspend fun updateTyping(@Path("id") channelId: String, @Body body: Map<String, String>): Map<String, Any>

    @GET("channels/{id}/typing")
    suspend fun getTyping(@Path("id") channelId: String): List<TypingStatus>

    // WORKSPACES
    @GET("workspaces")
    suspend fun getWorkspaces(): List<com.example.cu_orbit.data.Workspace>

    @POST("workspaces")
    suspend fun createWorkspace(@Body body: com.example.cu_orbit.data.ChannelRequest): com.example.cu_orbit.data.Workspace

    @GET("workspaces/{id}/channels")
    suspend fun getWorkspaceChannels(@Path("id") workspaceId: String): List<Channel>

    @POST("workspaces/{id}/channels")
    suspend fun createWorkspaceChannel(@Path("id") workspaceId: String, @Body body: ChannelRequest): Channel

    // STATUS
    @GET("status")
    suspend fun getStatuses(): List<Status>

    @POST("status")
    suspend fun postStatus(@Body body: Map<String, String?>): Status

    // UPLOAD
    @retrofit2.http.Multipart
    @POST("upload")
    suspend fun uploadFile(@retrofit2.http.Part file: okhttp3.MultipartBody.Part): Map<String, String>

    // MESSAGES
    @GET("channels/{channelId}/messages")
    suspend fun getMessages(@Path("channelId") channelId: String): List<Message>

    @GET("messages/{id}/replies")
    suspend fun getReplies(@Path("id") messageId: String): List<Message>

    @POST("messages")
    suspend fun sendMessage(@Body message: MessageRequest): Message

    @DELETE("messages/{id}")
    suspend fun deleteMessage(@Path("id") id: String): Map<String, Any>

    @PUT("messages/{id}")
    suspend fun editMessage(@Path("id") id: String, @Body body: Map<String, String>): Map<String, Any>

    @POST("messages/{id}/react")
    suspend fun reactToMessage(@Path("id") messageId: String, @Body body: Map<String, String>): Map<String, Any>

    // USERS
    @GET("users")
    suspend fun getUsers(): List<User>

    @GET("inbox/{userId}")
    suspend fun getInbox(@Path("userId") userId: String): List<User>
    
    @PUT("users/{phone}")
    suspend fun updateUser(@Path("phone") phone: String, @Body body: Map<String, String?>): Map<String, Any>

    @GET("users/{userId}")
    suspend fun getUser(@Path("userId") userId: String): User
}