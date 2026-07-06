package com.example.cu_orbit

import android.app.Application
import androidx.appcompat.app.AppCompatDelegate

class OrbitApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // Apply theme based on preferences
        val prefs = getSharedPreferences("CU_ORBIT_PREFS", android.content.Context.MODE_PRIVATE)
        val isDarkMode = prefs.getBoolean("DARK_MODE", false)
        if (isDarkMode) {
            AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_YES)
        } else {
            AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO)
        }
    }
}
