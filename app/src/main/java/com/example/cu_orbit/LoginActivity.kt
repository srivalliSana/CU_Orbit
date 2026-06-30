package com.example.cu_orbit

import android.content.Intent
import android.os.Bundle
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.example.cu_orbit.network.RetrofitClient
import com.example.cu_orbit.utils.AppUtils
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputEditText
import kotlinx.coroutines.launch

class LoginActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login)

        val editPhone: TextInputEditText = findViewById(R.id.edit_phone)
        val buttonContinue: Button = findViewById(R.id.button_continue)
        val buttonGoogle: MaterialButton = findViewById(R.id.button_google)

        buttonContinue.setOnClickListener {
            val phone = editPhone.text.toString().trim()
            if (phone.length == 10) {
                hideKeyboard()
                buttonContinue.isEnabled = false // Prevent multiple clicks
                sendOtp(phone, buttonContinue)
            } else {
                Toast.makeText(this, "Please enter a valid 10-digit number", Toast.LENGTH_SHORT).show()
            }
        }

        buttonGoogle.setOnClickListener {
            Toast.makeText(this, "Continue with Google clicked", Toast.LENGTH_SHORT).show()
        }
    }

    private fun hideKeyboard() {
        val view = this.currentFocus
        if (view != null) {
            val imm = getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
            imm.hideSoftInputFromWindow(view.windowToken, 0)
        }
    }

    private fun sendOtp(phone: String, button: Button) {
        lifecycleScope.launch {
            try {
                val response = RetrofitClient.instance.sendOtp(mapOf("phone" to phone))
                if (response["success"] == true) {
                    val intent = Intent(this@LoginActivity, OtpActivity::class.java)
                    intent.putExtra("PHONE_NUMBER", phone)
                    startActivity(intent)
                } else {
                    Toast.makeText(this@LoginActivity, "Failed to send OTP", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                e.printStackTrace()
                Toast.makeText(this@LoginActivity, AppUtils.getErrorMessage(e), Toast.LENGTH_LONG).show()
            } finally {
                button.isEnabled = true
            }
        }
    }
}