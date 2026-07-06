package com.example.cu_orbit.network

import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object RetrofitClient {
    var baseUrl = "http://192.168.29.192:3000/api/"
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

    private fun createService(): ApiService {
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }

        val client = OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
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
