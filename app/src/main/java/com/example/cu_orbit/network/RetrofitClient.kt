package com.example.cu_orbit.network

import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object RetrofitClient {
    var baseUrl = "http://192.168.29.195:3000/api/"
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
