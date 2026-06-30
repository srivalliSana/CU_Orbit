package com.example.cu_orbit

import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

import androidx.navigation.fragment.NavHostFragment
import androidx.navigation.ui.AppBarConfiguration
import androidx.navigation.ui.navigateUp
import androidx.navigation.ui.setupActionBarWithNavController
import androidx.navigation.ui.setupWithNavController
import com.google.android.material.bottomnavigation.BottomNavigationView

import androidx.drawerlayout.widget.DrawerLayout
import com.google.android.material.navigation.NavigationView
import androidx.appcompat.app.AppCompatDelegate
import android.content.Context
import android.widget.Toast

class MainActivity : AppCompatActivity() {
    private lateinit var appBarConfiguration: AppBarConfiguration

    override fun onCreate(savedInstanceState: Bundle?) {
        // Apply theme before super.onCreate
        val prefs = getSharedPreferences("CU_ORBIT_PREFS", Context.MODE_PRIVATE)
        val isDarkMode = prefs.getBoolean("DARK_MODE", false)
        if (isDarkMode) {
            AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_YES)
        } else {
            AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO)
        }

        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContentView(R.layout.activity_main)
        
        // Handle system bars properly for edge-to-edge
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.drawer_layout)) { v, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            // Apply bottom padding to the navigation view (bottom nav)
            val bottomNav: BottomNavigationView = findViewById(R.id.nav_view)
            bottomNav.setPadding(0, 0, 0, systemBars.bottom)
            insets
        }

        val drawerLayout: DrawerLayout = findViewById(R.id.drawer_layout)
        val navView: BottomNavigationView = findViewById(R.id.nav_view)
        val navigationView: NavigationView = findViewById(R.id.nav_drawer_view)

        val toolbar: com.google.android.material.appbar.MaterialToolbar = findViewById(R.id.toolbar)
        setSupportActionBar(toolbar)

        val navHostFragment = supportFragmentManager.findFragmentById(R.id.nav_host_fragment_activity_main) as NavHostFragment
        val navController = navHostFragment.navController
        
        appBarConfiguration = AppBarConfiguration(
            setOf(
                R.id.navigation_home, R.id.navigation_dms, R.id.navigation_activity, R.id.navigation_more, R.id.navigation_profile
            ), drawerLayout
        )
        setupActionBarWithNavController(navController, appBarConfiguration)
        navView.setupWithNavController(navController)
        navigationView.setupWithNavController(navController)

        // Hide the main toolbar on Home fragment to avoid double headers
        navController.addOnDestinationChangedListener { _, destination, _ ->
            if (destination.id == R.id.navigation_home) {
                supportActionBar?.hide()
            } else {
                supportActionBar?.show()
            }
        }

        // Handle drawer menu item clicks manually if they are not in the nav graph
        navigationView.setNavigationItemSelectedListener { menuItem ->
            when (menuItem.itemId) {
                R.id.nav_workspace_1 -> {
                    Toast.makeText(this, "Switched to CU Orbit", Toast.LENGTH_SHORT).show()
                }
                R.id.nav_workspace_2 -> {
                    Toast.makeText(this, "Switched to Computer Science", Toast.LENGTH_SHORT).show()
                }
                R.id.navigation_settings -> {
                    navController.navigate(R.id.navigation_settings)
                }
            }
            drawerLayout.closeDrawers()
            true
        }

        updateNavHeader(navigationView)
    }

    private fun updateNavHeader(navigationView: NavigationView) {
        val headerView = navigationView.getHeaderView(0)
        val prefs = getSharedPreferences("CU_ORBIT_PREFS", Context.MODE_PRIVATE)
        val name = prefs.getString("USER_NAME", "User")
        
        headerView.findViewById<android.widget.TextView>(R.id.nav_header_name).text = name
        headerView.findViewById<android.widget.TextView>(R.id.nav_header_status).text = "Active"
    }

    override fun onSupportNavigateUp(): Boolean {
        val navHostFragment = supportFragmentManager.findFragmentById(R.id.nav_host_fragment_activity_main) as NavHostFragment
        val navController = navHostFragment.navController
        return navController.navigateUp(appBarConfiguration) || super.onSupportNavigateUp()
    }
}