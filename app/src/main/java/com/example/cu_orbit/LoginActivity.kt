package com.example.cu_orbit

import android.content.Intent
import android.os.Bundle
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.example.cu_orbit.network.RetrofitClient
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputEditText
import kotlinx.coroutines.launch

class LoginActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login)

        val editPhone: TextInputEditText = findViewById(R.id.edit_phone)
        val buttonContinue: Button = findViewById(R.id.button_continue)
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
            val phone = editPhone.text.toString().trim()
            if (phone.length == 10) {
                hideKeyboard()
                buttonContinue.isEnabled = false
                loginDirectly(phone, buttonContinue)
            } else {
                Toast.makeText(this, "Please enter a valid 10-digit number", Toast.LENGTH_SHORT).show()
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

    private fun loginDirectly(phone: String, button: Button) {
        lifecycleScope.launch {
            try {
                val response = RetrofitClient.instance.login(mapOf("phone" to phone))
                if (response["success"] == true) {
                    val isNewUser = response["isNewUser"] as? Boolean ?: true
                    val prefs = getSharedPreferences("CU_ORBIT_PREFS", MODE_PRIVATE)
                    
                    prefs.edit().apply {
                        putString("USER_ID", phone)
                        (response["user"] as? Map<*, *>)?.let { user ->
                            putString("USER_NAME", user["name"]?.toString())
                        }
                    }.apply()

                    if (isNewUser) {
                        startActivity(Intent(this@LoginActivity, ProfileSetupActivity::class.java).putExtra("PHONE_NUMBER", phone))
                    } else {
                        startActivity(Intent(this@LoginActivity, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
                    }
                    finish()
                }
            } catch (e: Exception) {
                Toast.makeText(this@LoginActivity, "Timeout. Check your IP (tap title 5x)", Toast.LENGTH_LONG).show()
            } finally {
                button.isEnabled = true
            }
        }
    }
}