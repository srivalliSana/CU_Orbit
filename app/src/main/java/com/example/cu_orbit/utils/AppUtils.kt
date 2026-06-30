package com.example.cu_orbit.utils

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.core.content.FileProvider
import java.io.File

object AppUtils {
    /**
     * Shares the app's APK file. 
     * Note: For this to be "valid" on other phones, you must use a 'Single APK' build.
     */
    fun shareAppAPK(context: Context) {
        try {
            val appInfo = context.packageManager.getApplicationInfo(context.packageName, 0)
            val baseApk = File(appInfo.publicSourceDir)
            
            // Copy to shareable location
            val destFile = File(context.getExternalFilesDir(null), "CU_Orbit_v1.apk")
            baseApk.inputStream().use { input ->
                destFile.outputStream().use { output ->
                    input.copyTo(output)
                }
            }

            val uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                destFile
            )

            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "application/vnd.android.package-archive"
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            
            context.startActivity(Intent.createChooser(intent, "Share CU Orbit App"))
            
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(context, "Sharing failed. Please build a 'Single APK'.", Toast.LENGTH_LONG).show()
        }
    }

    fun inviteViaSMS(context: Context, phoneNumber: String) {
        try {
            val intent = Intent(Intent.ACTION_VIEW).apply {
                data = Uri.parse("sms:$phoneNumber")
                putExtra("sms_body", "Hey! Join me on CU Orbit. It's a great app for university communication. Download it here: https://cuorbit.example.com")
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(context, "Could not open SMS app", Toast.LENGTH_SHORT).show()
        }
    }
}