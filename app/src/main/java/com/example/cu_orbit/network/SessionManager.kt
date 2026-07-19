package com.example.cu_orbit.network

import android.content.Context
import android.content.SharedPreferences

/**
 * Holds the CU Orbit session token and the signed-in user's identity.
 *
 * The server derives the acting user from this token, so nothing here is sent
 * as a request parameter — storing the id is only so the UI can tell "mine"
 * from "theirs" without a round trip.
 */
object SessionManager {

    private const val PREFS = "CU_ORBIT_PREFS"
    private const val KEY_TOKEN = "ORBIT_SESSION"
    private const val KEY_USER_ID = "USER_ID"
    private const val KEY_USER_NAME = "USER_NAME"
    private const val KEY_USER_EMAIL = "USER_EMAIL"
    private const val KEY_USER_ROLE = "USER_ROLE"
    private const val KEY_USER_AVATAR = "USER_AVATAR"

    private lateinit var prefs: SharedPreferences

    fun init(context: Context) {
        prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    }

    private fun ready(): Boolean = this::prefs.isInitialized

    var token: String?
        get() = if (ready()) prefs.getString(KEY_TOKEN, null) else null
        set(value) { if (ready()) prefs.edit().putString(KEY_TOKEN, value).apply() }

    val userId: String? get() = if (ready()) prefs.getString(KEY_USER_ID, null) else null
    val userName: String? get() = if (ready()) prefs.getString(KEY_USER_NAME, null) else null
    val userRole: String? get() = if (ready()) prefs.getString(KEY_USER_ROLE, null) else null

    /** Staff-only, mirroring GROUP_CREATE_ROLES on the server. */
    val canCreateGroups: Boolean
        get() = userRole in setOf("faculty", "admin", "examcell", "coordinator")

    val isSignedIn: Boolean get() = !token.isNullOrBlank()

    fun saveUser(id: String?, name: String?, email: String?, role: String?, avatar: String?) {
        if (!ready()) return
        prefs.edit()
            .putString(KEY_USER_ID, id)
            .putString(KEY_USER_NAME, name)
            .putString(KEY_USER_EMAIL, email)
            .putString(KEY_USER_ROLE, role)
            .putString(KEY_USER_AVATAR, avatar)
            .apply()
    }

    /** Clear everything on sign-out or a rejected token. */
    fun clear() {
        if (!ready()) return
        prefs.edit()
            .remove(KEY_TOKEN)
            .remove(KEY_USER_ID)
            .remove(KEY_USER_NAME)
            .remove(KEY_USER_EMAIL)
            .remove(KEY_USER_ROLE)
            .remove(KEY_USER_AVATAR)
            .apply()
    }
}
