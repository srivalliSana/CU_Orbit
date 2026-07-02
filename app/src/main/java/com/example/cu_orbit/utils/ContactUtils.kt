package com.example.cu_orbit.utils

import android.content.Context
import android.content.pm.PackageManager
import android.provider.ContactsContract
import android.net.Uri
import androidx.core.content.ContextCompat

object ContactUtils {
    /**
     * Safely retrieves a contact name from the phone's address book.
     * Includes a permission check and try-catch to prevent SecurityExceptions/Crashes.
     */
    fun getContactName(context: Context, phoneNumber: String): String? {
        // 1. Check if permission is granted. If not, return null immediately.
        if (ContextCompat.checkSelfPermission(context, android.Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            return null
        }
        
        // 2. Perform the query safely
        try {
            val uri = Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(phoneNumber))
            val projection = arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME)
            
            context.contentResolver.query(uri, projection, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    return cursor.getString(0)
                }
            }
        } catch (e: Exception) {
            // Log and return null on any error (like a race condition or OS level failure)
            e.printStackTrace()
        }

        return null
    }
}
