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
import androidx.lifecycle.lifecycleScope
import com.example.cu_orbit.network.RealtimeClient
import com.example.cu_orbit.network.SessionManager
import com.example.cu_orbit.network.UpdateChecker
import kotlinx.coroutines.launch
import coil.load
import com.google.android.material.imageview.ShapeableImageView

class MainActivity : AppCompatActivity() {
    private lateinit var appBarConfiguration: AppBarConfiguration

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContentView(R.layout.activity_main)

        SessionManager.init(this)
        // Realtime for the whole session; individual screens join their own rooms.
        RealtimeClient.connect()

        // Old builds are not kept, so anyone behind the current one is prompted
        // to move to it. Silent if the check fails or the app is up to date.
        lifecycleScope.launch { UpdateChecker.check(this@MainActivity) }
        
        // Handle system bars properly for edge-to-edge
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.drawer_layout)) { v, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            // Apply bottom padding to the navigation view (bottom nav)
            val bottomNav: BottomNavigationView = findViewById(R.id.nav_view)
            bottomNav.setPadding(0, 0, 0, systemBars.bottom)
            insets
        }

        val drawerLayout: DrawerLayout = findViewById(R.id.drawer_layout)
        drawerLayout.addDrawerListener(object : DrawerLayout.SimpleDrawerListener() {
            override fun onDrawerOpened(drawerView: android.view.View) {
                loadWorkspacesInDrawer(findViewById(R.id.nav_drawer_view))
            }
        })
        val navView: BottomNavigationView = findViewById(R.id.nav_view)
        val navigationView: NavigationView = findViewById(R.id.nav_drawer_view)

        val toolbar: com.google.android.material.appbar.MaterialToolbar = findViewById(R.id.toolbar)
        setSupportActionBar(toolbar)

        val navHostFragment = supportFragmentManager.findFragmentById(R.id.nav_host_fragment_activity_main) as NavHostFragment
        val navController = navHostFragment.navController
        
        appBarConfiguration = AppBarConfiguration(
            setOf(
                R.id.navigation_home, R.id.navigation_activity, R.id.navigation_status, R.id.navigation_profile
            ), drawerLayout
        )
        setupActionBarWithNavController(navController, appBarConfiguration)
        navView.setupWithNavController(navController)
        navigationView.setupWithNavController(navController)

        // Hide the main toolbar on Home and Info fragments to avoid double headers
        navController.addOnDestinationChangedListener { _, destination, _ ->
            if (destination.id == R.id.navigation_home || destination.id == R.id.navigation_channel_info || destination.id == R.id.navigation_chat) {
                supportActionBar?.hide()
            } else {
                supportActionBar?.show()
            }
        }

        // Handle drawer menu item clicks manually if they are not in the nav graph
        navigationView.setNavigationItemSelectedListener { menuItem ->
            when (menuItem.itemId) {
                R.id.nav_workspace_1 -> {
                    Toast.makeText(this, "Welcome back to CU Orbit", Toast.LENGTH_SHORT).show()
                }
                R.id.nav_workspace_2 -> {
                    Toast.makeText(this, "Switched to Computer Science", Toast.LENGTH_SHORT).show()
                }
                R.id.nav_add_workspace -> {
                    navController.navigate(R.id.navigation_channels)
                }
                R.id.navigation_settings -> {
                    navController.navigate(R.id.navigation_settings)
                }
            }
            drawerLayout.closeDrawers()
            true
        }

        updateNavHeader(navigationView)
        loadWorkspacesInDrawer(navigationView)
        handleDeepLink(intent)
    }

    private fun handleDeepLink(intent: android.content.Intent?) {
        val data = intent?.data ?: return
        if (data.host == "cuorbit.app" && data.path?.startsWith("/join/") == true) {
            val code = data.lastPathSegment
            if (code != null) {
                joinChannelByCode(code)
            }
        }
    }

    private fun joinChannelByCode(code: String) {
        val prefs = getSharedPreferences("CU_ORBIT_PREFS", Context.MODE_PRIVATE)
        val userId = prefs.getString("USER_ID", "") ?: return
        
        lifecycleScope.launch {
            try {
                val response = com.example.cu_orbit.network.RetrofitClient.instance.joinChannelByLink(mapOf("inviteCode" to code, "userId" to userId))
                if (response["success"] == true) {
                    Toast.makeText(this@MainActivity, "Joined channel via link!", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {}
        }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        handleDeepLink(intent)
    }

    private fun loadWorkspacesInDrawer(navigationView: NavigationView) {
        val menu = navigationView.menu
        val workspaceSubMenu = menu.findItem(R.id.nav_workspace_group)?.subMenu ?: return
        
        lifecycleScope.launch {
            try {
                val workspaces = com.example.cu_orbit.network.RetrofitClient.instance.getWorkspaces()
                workspaceSubMenu.clear()
                workspaces.forEach { ws ->
                    workspaceSubMenu.add(0, android.view.View.generateViewId(), 0, ws.name).apply {
                        setIcon(R.drawable.ic_home)
                        setOnMenuItemClickListener {
                            val navController = (supportFragmentManager.findFragmentById(R.id.nav_host_fragment_activity_main) as NavHostFragment).navController
                            val bundle = Bundle().apply {
                                putString("workspaceName", ws.name)
                                putString("workspaceId", ws.id)
                            }
                            navController.navigate(R.id.navigation_workspace_channels, bundle)
                            findViewById<DrawerLayout>(R.id.drawer_layout).closeDrawers()
                            true
                        }
                    }
                }
                workspaceSubMenu.add(0, R.id.nav_add_workspace, 99, "Add a Workspace").apply {
                    setIcon(android.R.drawable.ic_menu_add)
                }
            } catch (e: Exception) {
                // Silently fail or show error in log
            }
        }
    }

    private fun updateNavHeader(navigationView: NavigationView) {
        val headerView = navigationView.getHeaderView(0)
        val prefs = getSharedPreferences("CU_ORBIT_PREFS", Context.MODE_PRIVATE)
        val name = prefs.getString("USER_NAME", "User")
        val avatarUrl = prefs.getString("USER_AVATAR", "")
        
        headerView.findViewById<android.widget.TextView>(R.id.nav_header_name).text = name
        headerView.findViewById<android.widget.TextView>(R.id.nav_header_status).text = "Active"
        
        val headerImage = headerView.findViewById<ShapeableImageView>(R.id.nav_header_avatar)
        val absoluteAvatarUrl = com.example.cu_orbit.network.RetrofitClient.getAbsoluteUrl(avatarUrl)
        if (absoluteAvatarUrl != null && absoluteAvatarUrl.isNotEmpty()) {
            headerImage.load(absoluteAvatarUrl) {
                crossfade(true)
                placeholder(R.drawable.ic_person)
                error(R.drawable.ic_person)
            }
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        val navHostFragment = supportFragmentManager.findFragmentById(R.id.nav_host_fragment_activity_main) as NavHostFragment
        val navController = navHostFragment.navController
        return navController.navigateUp(appBarConfiguration) || super.onSupportNavigateUp()
    }
}