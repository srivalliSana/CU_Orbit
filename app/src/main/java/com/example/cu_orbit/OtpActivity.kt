package com.example.cu_orbit

import android.Manifest
import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.ImageButton
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.lifecycle.lifecycleScope
import com.example.cu_orbit.network.RetrofitClient
import com.example.cu_orbit.utils.AppUtils
import com.google.android.material.textfield.TextInputEditText
import kotlinx.coroutines.launch

class OtpActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_otp)

        val phone = intent.getStringExtra("PHONE_NUMBER") ?: ""
        findViewById<TextView>(R.id.text_otp_sent).text = getString(R.string.otp_sent_text, phone)

        findViewById<ImageButton>(R.id.button_back).setOnClickListener { finish() }

        val editOtp: TextInputEditText = findViewById(R.id.edit_otp)
        val buttonVerify: Button = findViewById(R.id.button_verify)

        buttonVerify.setOnClickListener {
            val otp = editOtp.text.toString().trim()
            if (otp.length == 6) {
                verifyOtp(phone, otp)
            } else {
                Toast.makeText(this, "Please enter 6-digit OTP", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun verifyOtp(phone: String, otp: String) {
        lifecycleScope.launch {
            try {
                val response = RetrofitClient.instance.verifyOtp(
                    mapOf("phone" to phone, "otp" to otp)
                )
                if (response["success"] == true) {
                    val isNewUser = response["isNewUser"] as? Boolean ?: true
                    
                    // Save user ID (phone) for the session
                    val prefs = getSharedPreferences("CU_ORBIT_PREFS", MODE_PRIVATE)
                    prefs.edit().putString("USER_ID", phone).apply()

                    if (isNewUser) {
                        // Move to profile setup
                        val intent = Intent(this@OtpActivity, ProfileSetupActivity::class.java)
                        intent.putExtra("PHONE_NUMBER", phone)
                        startActivity(intent)
                        finish()
                    } else {
                        // Existing user, go straight to main
                        ActivityCompat.requestPermissions(this@OtpActivity, arrayOf(Manifest.permission.READ_CONTACTS), 101)
                        val intent = Intent(this@OtpActivity, MainActivity::class.java)
                        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                        startActivity(intent)
                        finish()
                    }
                } else {
                    Toast.makeText(this@OtpActivity, "Invalid OTP", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                e.printStackTrace()
                Toast.makeText(this@OtpActivity, AppUtils.getErrorMessage(e), Toast.LENGTH_LONG).show()
            }
        }
    }
}