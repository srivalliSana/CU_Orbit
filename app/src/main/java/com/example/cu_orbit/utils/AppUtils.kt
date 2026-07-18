package com.example.cu_orbit.utils

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import com.example.cu_orbit.network.RetrofitClient

object AppUtils {
    /**
     * Opens the official university landing page for downloading the app.
     * This ensures everyone gets a valid, complete APK.
     */
    fun shareAppAPK(context: Context) {
        try {
            val landingUrl = RetrofitClient.baseUrl.replace("/api/", "")
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(landingUrl))
            context.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(context, "Could not open download page", Toast.LENGTH_SHORT).show()
        }
    }

    fun inviteViaSMS(context: Context, phoneNumber: String) {
        try {
            val landingUrl = RetrofitClient.baseUrl.replace("/api/", "")
            val intent = Intent(Intent.ACTION_VIEW).apply {
                data = Uri.parse("sms:$phoneNumber")
                putExtra("sms_body", "Hey! Join me on CU Orbit. It's our official university platform. Download it here: $landingUrl")
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(context, "Could not open SMS app", Toast.LENGTH_SHORT).show()
        }
    }

    fun getErrorMessage(e: Exception): String {
        return if (e is retrofit2.HttpException) {
            try {
                val errorJson = e.response()?.errorBody()?.string()
                val errorMap = com.google.gson.Gson().fromJson(errorJson, Map::class.java)
                errorMap["message"]?.toString() ?: "Server error: ${e.code()}"
            } catch (ex: Exception) {
                "Server error: ${e.code()}"
            }
        } else {
            "Connection error. Please check your network."
        }
    }
}
