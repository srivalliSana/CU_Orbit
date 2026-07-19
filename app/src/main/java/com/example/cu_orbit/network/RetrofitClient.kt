package com.example.cu_orbit.network

import com.example.cu_orbit.BuildConfig

import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object RetrofitClient {
    var baseUrl = "https://cumess.cutm.ac.in/api/"
        private set

    private var _instance: ApiService? = null

    val instance: ApiService
        get() {
            if (_instance == null) {
                _instance = createService()
            }
            return _instance!!
        }



    fun updateBaseUrl(ip: String) {
        baseUrl = if (ip.startsWith("http")) ip else "http://$ip:3000/api/"

        _instance = createService()
    }

    fun getAbsoluteUrl(path: String?): String? {
        if (path == null || path.isEmpty()) return null
        val cleanBase = baseUrl.replace("/api/", "")
        
        // Fix for old URLs stored in DB with different IPs
        val uploadsIndex = path.indexOf("/uploads/")
        if (uploadsIndex != -1) {
            val relative = path.substring(uploadsIndex)
            return cleanBase + relative
        }
        
        if (path.startsWith("http")) return path
        return if (path.startsWith("/")) cleanBase + path else "$cleanBase/$path"
    }

    /** Raised when the server rejects our session, so the UI can send the user back to sign-in. */
    var onUnauthorized: (() -> Unit)? = null

    private fun createService(): ApiService {
        val logging = HttpLoggingInterceptor().apply {
            // BODY logs request bodies, which includes the bearer token and message
            // contents. Fine while debugging, never in a release build.
            level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC
                    else HttpLoggingInterceptor.Level.NONE
        }

        // Every API call carries the session; the server derives the user from it.
        val auth = Interceptor { chain ->
            val token = SessionManager.token
            val request = if (token.isNullOrBlank()) chain.request()
                else chain.request().newBuilder()
                    .header("Authorization", "Bearer $token")
                    .build()

            val response = chain.proceed(request)
            if (response.code == 401) {
                SessionManager.clear()
                onUnauthorized?.invoke()
            }
            response
        }

        val client = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .addInterceptor(auth)
            .addInterceptor(logging)
            .build()

        val retrofit = Retrofit.Builder()
            .baseUrl(baseUrl)
            .addConverterFactory(GsonConverterFactory.create())
            .client(client)
            .build()

        return retrofit.create(ApiService::class.java)
    }
}
