package com.example.cu_orbit.network

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import android.util.Log
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.core.content.FileProvider
import com.example.cu_orbit.BuildConfig
import com.example.cu_orbit.data.LatestVersion
import java.io.File

/**
 * In-app update.
 *
 * Old builds are not retained, so anyone behind the current one is moved to it.
 *
 * Android does not allow a sideloaded app to install silently — that requires
 * Play Store distribution or device-owner privileges. The closest achievable is
 * to check, download, and open the installer automatically, leaving the user a
 * single confirmation.
 *
 * Deliberately quiet: a failed check counts as "no update", because being
 * unable to reach the server must not interrupt someone opening their messages.
 */
object UpdateChecker {

    private const val TAG = "OrbitUpdate"
    private const val PREFS = "CU_ORBIT_PREFS"
    private const val KEY_SKIPPED = "UPDATE_SKIPPED_BUILD"
    private const val AUTHORITY = "com.example.cu_orbit.fileprovider"
    private const val FILE_NAME = "cu_orbit_update.apk"

    /** Call once the main screen is up. Shows a dialog only when newer. */
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

        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        // Respect an earlier "later" for this same build, unless asked directly.
        if (!force && prefs.getInt(KEY_SKIPPED, -1) == newest) return

        AlertDialog.Builder(context)
            .setTitle("Update available")
            .setMessage(
                "CU Orbit ${latest.version} is ready. You have ${BuildConfig.VERSION_NAME}.\n\n" +
                    "It will download and open the installer for you."
            )
            .setPositiveButton("Update now") { _, _ -> startDownload(context, latest) }
            .setNegativeButton("Later") { _, _ -> prefs.edit().putInt(KEY_SKIPPED, newest).apply() }
            .show()
    }

    private fun startDownload(context: Context, latest: LatestVersion) {
        val base = RetrofitClient.baseUrl.replace("/api/", "")
        val url = latest.downloadUrl?.let { if (it.startsWith("http")) it else base + it } ?: return

        // A stale file from a previous attempt would otherwise be installed.
        File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), FILE_NAME).delete()

        val manager = context.getSystemService(Context.DOWNLOAD_SERVICE) as? DownloadManager
        if (manager == null) {
            openInBrowser(context, url)
            return
        }

        val id = try {
            manager.enqueue(
                DownloadManager.Request(Uri.parse(url))
                    .setTitle("CU Orbit ${latest.version ?: ""}")
                    .setDescription("Downloading update")
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    .setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, FILE_NAME)
                    .setMimeType("application/vnd.android.package-archive")
            )
        } catch (e: Exception) {
            // DownloadManager is disabled on some devices and ROMs.
            Log.w(TAG, "DownloadManager unavailable", e)
            openInBrowser(context, url)
            return
        }

        Toast.makeText(context, "Downloading update…", Toast.LENGTH_SHORT).show()
        awaitDownload(context.applicationContext, manager, id)
    }

    /** Open the installer as soon as the download lands. */
    private fun awaitDownload(appContext: Context, manager: DownloadManager, id: Long) {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                if (intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) != id) return
                runCatching { appContext.unregisterReceiver(this) }

                val status = manager.query(DownloadManager.Query().setFilterById(id)).use { c ->
                    if (c.moveToFirst()) c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)) else -1
                }
                if (status != DownloadManager.STATUS_SUCCESSFUL) {
                    Toast.makeText(appContext, "Update download failed.", Toast.LENGTH_LONG).show()
                    return
                }

                val file = File(appContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), FILE_NAME)
                if (!file.exists()) {
                    Toast.makeText(appContext, "Update file missing.", Toast.LENGTH_LONG).show()
                    return
                }
                install(appContext, file)
            }
        }

        val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            appContext.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            appContext.registerReceiver(receiver, filter)
        }
    }

    private fun install(context: Context, file: File) {
        // From Android 8, installing requires per-app consent. Send the user to
        // that setting rather than failing with an opaque error.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.packageManager.canRequestPackageInstalls()) {
            Toast.makeText(context, "Allow CU Orbit to install updates, then tap Update again.", Toast.LENGTH_LONG).show()
            runCatching {
                context.startActivity(
                    Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            }
            return
        }

        val uri = FileProvider.getUriForFile(context, AUTHORITY, file)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        runCatching { context.startActivity(intent) }
            .onFailure {
                Log.w(TAG, "could not open installer", it)
                Toast.makeText(context, "Open the downloaded file to install.", Toast.LENGTH_LONG).show()
            }
    }

    private fun openInBrowser(context: Context, url: String) {
        runCatching {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }
}
