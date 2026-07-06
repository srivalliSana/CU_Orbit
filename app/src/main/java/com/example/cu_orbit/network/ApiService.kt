package com.example.cu_orbit.network

import com.example.cu_orbit.data.*
import retrofit2.http.*

interface ApiService {
    // AUTH
    @POST("auth/login")
    suspend fun login(@Body body: Map<String, String>): Map<String, Any>

    @POST("auth/register")
    suspend fun register(@Body user: Map<String, String>): Map<String, Any>

    // HOME
    @GET("home/{userId}/{workspaceId}")
    suspend fun getHomeFeed(@Path("userId") userId: String, @Path("workspaceId") workspaceId: String): HomeFeedResponse

    @GET("home/quick-access/{userId}")
    suspend fun getQuickAccessCounts(@Path("userId") userId: String): QuickAccessResponse

    // WORKSPACES
    @GET("workspaces")
    suspend fun getWorkspaces(): List<Workspace>

    @POST("workspaces")
    suspend fun createWorkspace(@Body body: Map<String, String>): Workspace

    // CHANNELS
    @GET("workspaces/{id}/channels")
    suspend fun getWorkspaceChannels(@Path("id") workspaceId: String, @Query("userId") userId: String? = null, @Query("type") type: String? = null): List<Channel>

    @POST("workspaces/{id}/channels")
    suspend fun createWorkspaceChannel(@Path("id") workspaceId: String, @Body body: ChannelRequest): Channel

    @GET("channels/{id}")
    suspend fun getChannel(@Path("id") id: String): Channel

    @POST("channels/{id}/members")
    suspend fun addChannelMember(@Path("id") channelId: String, @Body body: Map<String, String>): Map<String, Any>

    @POST("channels/{id}/typing")
    suspend fun updateTyping(@Path("id") channelId: String, @Body body: Map<String, String>): Map<String, Any>

    @GET("channels/{id}/typing")
    suspend fun getTyping(@Path("id") channelId: String): List<TypingStatus>

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
    @GET("messages/{containerId}")
    suspend fun getMessages(@Path("containerId") containerId: String): List<Message>

    @POST("messages")
    suspend fun sendMessage(@Body message: MessageRequest): Message

    @PUT("messages/{id}")
    suspend fun editMessage(@Path("id") id: String, @Body body: Map<String, String?>): Map<String, Any>

    @POST("messages/{id}/reactions")
    suspend fun reactToMessage(@Path("id") id: String, @Body body: Map<String, String>): Map<String, Any>

    @DELETE("messages/{id}")
    suspend fun deleteMessage(@Path("id") id: String): Map<String, Any>

    // USERS
    @GET("users")
    suspend fun getUsers(): List<User>
    
    @GET("inbox/{userId}")
    suspend fun getInbox(@Path("userId") userId: String): List<User>
    
    @POST("drafts")
    suspend fun saveDraft(@Body draft: Map<String, String>): Map<String, Any>

    @GET("drafts/{userId}")
    suspend fun getDrafts(@Path("userId") userId: String): List<Draft>

    @GET("mentions/{userId}")
    suspend fun getMentions(@Path("userId") userId: String): List<Mention>

    @PUT("users/{phone}")
    suspend fun updateUser(@Path("phone") phone: String, @Body body: Map<String, String?>): Map<String, Any>

    @GET("users/{userId}")
    suspend fun getUser(@Path("userId") userId: String): User

    @GET("search")
    suspend fun search(
        @Query("query") query: String,
        @Query("userId") userId: String,
        @Query("workspaceId") workspaceId: String
    ): SearchResponse
}
