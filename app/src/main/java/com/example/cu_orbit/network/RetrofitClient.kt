package com.example.cu_orbit.network

import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object RetrofitClient {
    /**
     * BASE_URL Configuration:
     * - FOR EMULATOR: Use "http://10.0.2.2:3000/api/"
     * - FOR REAL DEVICE: Use your Computer's IPv4 Address (e.g., "http://192.168.1.5:3000/api/")
     *   (Find IP on Windows: 'ipconfig', on Mac/Linux: 'ifconfig')
     * - Ensure your backend server is listening on 0.0.0.0, not just localhost/127.0.0.1
     */
    private const val BASE_URL = "http://192.168.29.193:3000/api/" // Change this to your computer's IP if using a real device

    private val logging = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BODY
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .addInterceptor(logging)
        .build()

    val instance: ApiService by lazy {
        val retrofit = Retrofit.Builder()
            .baseUrl(BASE_URL)
            .addConverterFactory(GsonConverterFactory.create())
            .client(client)
            .build()

        retrofit.create(ApiService::class.java)
    }
}