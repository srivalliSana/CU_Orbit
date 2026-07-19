package com.example.cu_orbit.network

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.util.Log
import androidx.appcompat.app.AlertDialog
import com.example.cu_orbit.BuildConfig
import com.example.cu_orbit.data.LatestVersion

/**
 * In-app update check.
 *
 * Old versions are not kept: there is one current build, and anyone behind it
 * is prompted to move to it. Deliberately quiet — a failed check is treated as
 * "no update", never as an error, since being unable to reach the server should
 * not interrupt someone opening their messages.
 */
object UpdateChecker {

    private const val TAG = "OrbitUpdate"
    private const val PREFS = "CU_ORBIT_PREFS"
    private const val KEY_SKIPPED = "UPDATE_SKIPPED_BUILD"

    /** Call from the main screen once it is up. Shows a dialog only if newer. */
    suspend fun check(context: Context, force: Boolean = false) {
        val latest: LatestVersion = try {
            RetrofitClient.instance.latestVersion()
        } catch (e: Exception) {
            Log.d(TAG, "update check skipped: ${e.message}")
            return
        }

        if (!latest.available) return
        val newest = latest.buildNumber ?: return
        if (newest <= BuildConfig.VERSION_CODE) return

        // Respect a previous "later" for this same build, unless asked directly.
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!force && prefs.getInt(KEY_SKIPPED, -1) == newest) return

        AlertDialog.Builder(context)
            .setTitle("Update available")
            .setMessage("CU Orbit ${latest.version} is available. You have ${BuildConfig.VERSION_NAME}.")
            .setPositiveButton("Update") { _, _ -> download(context, latest) }
            .setNegativeButton("Later") { _, _ -> prefs.edit().putInt(KEY_SKIPPED, newest).apply() }
            .setCancelable(true)
            .show()
    }

    private fun download(context: Context, latest: LatestVersion) {
        val base = RetrofitClient.baseUrl.replace("/api/", "")
        val url = latest.downloadUrl?.let { if (it.startsWith("http")) it else base + it } ?: return
        val fileName = "cu_orbit_${latest.version ?: "latest"}.apk"

        try {
            val request = DownloadManager.Request(Uri.parse(url))
                .setTitle("CU Orbit ${latest.version ?: ""}")
                .setDescription("Downloading update")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, fileName)
                .setMimeType("application/vnd.android.package-archive")

            (context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
        } catch (e: Exception) {
            // DownloadManager can be disabled on some devices — fall back to the
            // browser rather than failing silently.
            Log.w(TAG, "DownloadManager unavailable, opening browser", e)
            runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
        }
    }
}
