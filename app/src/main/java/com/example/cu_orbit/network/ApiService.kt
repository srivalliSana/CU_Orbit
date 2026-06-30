package com.example.cu_orbit.network

import com.example.cu_orbit.data.Channel
import com.example.cu_orbit.data.ChannelRequest
import com.example.cu_orbit.data.Message
import com.example.cu_orbit.data.MessageRequest
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

    @POST("channels/{id}/members")
    suspend fun addChannelMember(@Path("id") channelId: String, @Body body: Map<String, String>): Map<String, Any>

    @POST("channels/{id}/typing")
    suspend fun updateTyping(@Path("id") channelId: String, @Body body: Map<String, String>): Map<String, Any>

    @GET("channels/{id}/typing")
    suspend fun getTyping(@Path("id") channelId: String): List<TypingStatus>

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
    
    @GET("users/{userId}")
    suspend fun getUser(@Path("userId") userId: String): User
}