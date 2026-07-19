package com.example.cu_orbit

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabsIntent
import androidx.lifecycle.lifecycleScope
import com.example.cu_orbit.network.RetrofitClient
import com.example.cu_orbit.network.SessionManager
import kotlinx.coroutines.launch

/**
 * Sign-in via CampusOne.
 *
 * CU Orbit has no login of its own any more — CampusOne is the identity source.
 * We open its /connect/mobile page in a Custom Tab; it authenticates the user
 * with whatever method CampusOne uses (Google today), mints a 60-second handoff
 * token, and redirects back to cuorbit://auth?token=… which lands in
 * onNewIntent below.
 *
 * A Custom Tab rather than a WebView, deliberately: it shares the system
 * browser's cookies, so anyone already signed into CampusOne is not asked
 * again, and credentials are never typed inside our app.
 */
class LoginActivity : AppCompatActivity() {

    private lateinit var statusText: TextView
    private lateinit var signInButton: Button
    private var progress: View? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login)
        SessionManager.init(this)

        statusText = findViewById(R.id.text_welcome)
        signInButton = findViewById(R.id.button_google)
        progress = findViewById(R.id.login_progress)

        // The email box and Continue button drove the retired passwordless
        // flow; sign-in now goes through CampusOne.
        findViewById<View>(R.id.layout_email)?.visibility = View.GONE
        findViewById<View>(R.id.button_continue)?.visibility = View.GONE
        findViewById<View>(R.id.text_or)?.visibility = View.GONE

        signInButton.text = getString(R.string.sign_in_with_campusone)
        signInButton.setOnClickListener { startCampusOneSignIn() }

        // Hidden entry point for pointing the app at a local server.
        var taps = 0
        statusText.setOnClickListener { if (++taps >= 5) { taps = 0; showServerDialog() } }

        when {
            intent?.data != null -> handleAuthRedirect(intent)
            SessionManager.isSignedIn -> validateExistingSession()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleAuthRedirect(intent)
    }

    private fun startCampusOneSignIn() {
        val campus = getString(R.string.campusone_url).trimEnd('/')
        val url = "$campus/connect/mobile?redirect_uri=" + Uri.encode(AUTH_REDIRECT)
        try {
            CustomTabsIntent.Builder().setShowTitle(true).build()
                .launchUrl(this, Uri.parse(url))
        } catch (e: Exception) {
            // No Custom Tab provider — fall back to any browser.
            try {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
            } catch (e2: Exception) {
                toast("No browser available to sign in.")
            }
        }
    }

    /** Handles cuorbit://auth?token=… coming back from CampusOne. */
    private fun handleAuthRedirect(intent: Intent?) {
        val token = intent?.data
            ?.takeIf { it.scheme == "cuorbit" }
            ?.getQueryParameter("token")
            ?: return

        busy(true, "Signing you in…")
        lifecycleScope.launch {
            try {
                val res = RetrofitClient.instance.ssoExchange(mapOf("token" to token))
                val session = res.session
                val user = res.user
                if (session.isNullOrBlank() || user == null) {
                    busy(false, getString(R.string.login_welcome))
                    toast("Sign-in failed. Please try again.")
                    return@launch
                }
                SessionManager.token = session
                SessionManager.saveUser(user.id, user.name, user.campusEmail ?: user.email, user.role, user.avatarUrl)
                goToMain()
            } catch (e: Exception) {
                busy(false, getString(R.string.login_welcome))
                toast(e.message ?: "Could not sign in.")
            }
        }
    }

    /** A stored session may have expired while the app was closed. */
    private fun validateExistingSession() {
        busy(true, "Signing you in…")
        lifecycleScope.launch {
            try {
                val user = RetrofitClient.instance.me().user
                if (user != null) {
                    SessionManager.saveUser(user.id, user.name, user.campusEmail ?: user.email, user.role, user.avatarUrl)
                    goToMain()
                } else {
                    SessionManager.clear()
                    busy(false, getString(R.string.login_welcome))
                }
            } catch (e: Exception) {
                SessionManager.clear()
                busy(false, getString(R.string.login_welcome))
            }
        }
    }

    private fun goToMain() {
        startActivity(
            Intent(this, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        )
        finish()
    }

    private fun busy(on: Boolean, message: String? = null) {
        progress?.visibility = if (on) View.VISIBLE else View.GONE
        signInButton.isEnabled = !on
        message?.let { statusText.text = it }
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_LONG).show()

    private fun showServerDialog() {
        val input = android.widget.EditText(this).apply {
            hint = "192.168.1.5  or  https://host"
            setText(RetrofitClient.baseUrl)
        }
        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Server address")
            .setView(input)
            .setPositiveButton("Save") { _, _ ->
                val value = input.text.toString().trim()
                if (value.isNotEmpty()) {
                    RetrofitClient.updateBaseUrl(value)
                    toast("Server set to ${RetrofitClient.baseUrl}")
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    companion object {
        const val AUTH_REDIRECT = "cuorbit://auth"
    }
}
