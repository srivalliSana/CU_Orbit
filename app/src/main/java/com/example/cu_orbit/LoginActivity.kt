package com.example.cu_orbit

import android.content.Intent
import android.os.Bundle
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.example.cu_orbit.network.RetrofitClient
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.google.android.material.textfield.TextInputEditText
import kotlinx.coroutines.launch

class LoginActivity : AppCompatActivity() {

    private val RC_SIGN_IN = 9001

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login)

        val editEmail: TextInputEditText = findViewById(R.id.edit_email)
        val buttonContinue: Button = findViewById(R.id.button_continue)
        val buttonGoogle: Button = findViewById(R.id.button_google)
        val signTitle: android.widget.TextView = findViewById(R.id.text_welcome)

        var tapCount = 0
        signTitle.setOnClickListener {
            tapCount++
            if (tapCount >= 5) {
                tapCount = 0
                showIpDialog()
            }
        }

        buttonContinue.setOnClickListener {
            val email = editEmail.text.toString().trim().lowercase()
            if (isValidUniversityEmail(email)) {
                hideKeyboard()
                buttonContinue.isEnabled = false
                loginWithEmail(email, buttonContinue)
            } else {
                Toast.makeText(this, "Only @cutm.ac.in or @cutmap.ac.in emails are allowed", Toast.LENGTH_SHORT).show()
            }
        }

        buttonGoogle.setOnClickListener {
            signInWithGoogle()
        }
    }

    private fun isValidUniversityEmail(email: String): Boolean {
        return email.endsWith("@cutm.ac.in") || email.endsWith("@cutmap.ac.in")
    }

    private fun signInWithGoogle() {
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestEmail()
            .requestProfile()
            .build()
        val googleSignInClient = GoogleSignIn.getClient(this, gso)
        startActivityForResult(googleSignInClient.signInIntent, RC_SIGN_IN)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == RC_SIGN_IN) {
            val task = GoogleSignIn.getSignedInAccountFromIntent(data)
            try {
                val account = task.getResult(ApiException::class.java)
                val email = account?.email ?: ""
                if (isValidUniversityEmail(email)) {
                    loginWithEmail(email, findViewById(R.id.button_google))
                } else {
                    GoogleSignIn.getClient(this, GoogleSignInOptions.DEFAULT_SIGN_IN).signOut()
                    Toast.makeText(this, "Only @cutm.ac.in or @cutmap.ac.in emails are allowed", Toast.LENGTH_SHORT).show()
                }
            } catch (e: ApiException) {
                Toast.makeText(this, "Google sign in failed", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun showIpDialog() {
        val input = android.widget.EditText(this).apply { 
            hint = "192.168.x.x"
            setText(RetrofitClient.baseUrl.replace("http://", "").replace(":3000/api/", ""))
        }
        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Change Server IP")
            .setView(input)
            .setPositiveButton("Update") { _, _ ->
                val ip = input.text.toString().trim()
                if (ip.isNotEmpty()) {
                    RetrofitClient.updateBaseUrl(ip)
                    Toast.makeText(this, "IP Updated to $ip", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun hideKeyboard() {
        val view = this.currentFocus
        if (view != null) {
            val imm = getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
            imm.hideSoftInputFromWindow(view.windowToken, 0)
        }
    }

    private fun loginWithEmail(email: String, button: Button) {
        lifecycleScope.launch {
            try {
                val response = RetrofitClient.instance.login(mapOf("email" to email))
                if (response["success"] == true) {
                    val isNewUser = response["isNewUser"] as? Boolean ?: true
                    val prefs = getSharedPreferences("CU_ORBIT_PREFS", MODE_PRIVATE)
                    
                    prefs.edit().apply {
                        putString("USER_EMAIL", email)
                        (response["user"] as? Map<*, *>)?.let { user ->
                            putString("USER_ID", user["phone"]?.toString())
                            putString("USER_NAME", user["name"]?.toString())
                        }
                    }.apply()

                    if (isNewUser) {
                        startActivity(Intent(this@LoginActivity, ProfileSetupActivity::class.java).putExtra("EMAIL", email))
                    } else {
                        startActivity(Intent(this@LoginActivity, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
                    }
                    finish()
                }
            } catch (e: Exception) {
                Toast.makeText(this@LoginActivity, "Connection failed. Check your IP.", Toast.LENGTH_LONG).show()
            } finally {
                button.isEnabled = true
            }
        }
    }
}
