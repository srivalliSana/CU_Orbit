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
import com.google.android.material.textfield.TextInputEditText
import kotlinx.coroutines.launch

class ProfileSetupActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_profile_setup)

        val phone = intent.getStringExtra("PHONE_NUMBER") ?: ""
        
        val editName: TextInputEditText = findViewById(R.id.edit_setup_name)
        val editEmail: TextInputEditText = findViewById(R.id.edit_setup_email)
        val editDept: TextInputEditText = findViewById(R.id.edit_setup_dept)
        val btnFinish: Button = findViewById(R.id.button_finish_setup)

        btnFinish.setOnClickListener {
            val name = editName.text.toString().trim()
            val email = editEmail.text.toString().trim()
            val dept = editDept.text.toString().trim()

            if (name.isNotEmpty() && email.isNotEmpty()) {
                hideKeyboard()
                registerUser(phone, name, email, dept)
            } else {
                Toast.makeText(this, "Please fill in all required fields", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun hideKeyboard() {
        val view = this.currentFocus
        if (view != null) {
            val imm = getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
            imm.hideSoftInputFromWindow(view.windowToken, 0)
        }
    }

    private fun registerUser(phone: String, name: String, email: String, dept: String) {
        lifecycleScope.launch {
            try {
                val response = RetrofitClient.instance.register(mapOf(
                    "phone" to phone,
                    "name" to name,
                    "email" to email,
                    "department" to dept,
                    "bio" to "Hey there! I am using CU Orbit."
                ))
                
                if (response["success"] == true) {
                    val prefs = getSharedPreferences("CU_ORBIT_PREFS", MODE_PRIVATE)
                    prefs.edit().apply {
                        putString("USER_NAME", name)
                        putString("USER_EMAIL", email)
                        putString("USER_ID", phone)
                        putString("USER_BIO", "Hey there! I am using CU Orbit.")
                    }.apply()

                    Toast.makeText(this@ProfileSetupActivity, "Registration Successful", Toast.LENGTH_SHORT).show()
                    val intent = Intent(this@ProfileSetupActivity, MainActivity::class.java)
                    intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                    startActivity(intent)
                    finish()
                }
            } catch (e: Exception) {
                // Local fallback registration
                val prefs = getSharedPreferences("CU_ORBIT_PREFS", MODE_PRIVATE)
                prefs.edit().apply {
                    putString("USER_NAME", name)
                    putString("USER_ID", phone)
                }.apply()
                startActivity(Intent(this@ProfileSetupActivity, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
                finish()
            }
        }
    }
}