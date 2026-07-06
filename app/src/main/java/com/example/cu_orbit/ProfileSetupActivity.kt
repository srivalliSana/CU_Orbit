package com.example.cu_orbit

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.provider.OpenableColumns
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.ImageView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.lifecycle.lifecycleScope
import coil.load
import com.example.cu_orbit.network.RetrofitClient
import com.example.cu_orbit.repository.MainRepository
import com.google.android.material.textfield.TextInputEditText
import kotlinx.coroutines.launch
import java.io.File

class ProfileSetupActivity : AppCompatActivity() {

    private val repository = MainRepository()
    private var currentAvatarUrl = ""
    private lateinit var avatarImage: ImageView
    private var capturedFile: File? = null
    private var photoUri: Uri? = null

    private val requestPermissionsLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (!permissions.values.all { it }) {
            Toast.makeText(this, "Permissions required to add photo", Toast.LENGTH_SHORT).show()
        }
    }

    private val takePictureLauncher = registerForActivityResult(ActivityResultContracts.TakePicture()) { success ->
        if (success) {
            capturedFile?.let { uploadPhoto(it) }
        }
    }

    private val pickImageLauncher = registerForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri?.let {
            val fileName = getFileName(it)
            val localFile = saveUriToLocalFile(it, fileName)
            if (localFile != null) {
                uploadPhoto(localFile)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_profile_setup)

        val phone = intent.getStringExtra("PHONE_NUMBER") ?: ""
        
        avatarImage = findViewById(R.id.image_setup_avatar)
        val editName: TextInputEditText = findViewById(R.id.edit_setup_name)
        val editEmail: TextInputEditText = findViewById(R.id.edit_setup_email)
        val editDept: TextInputEditText = findViewById(R.id.edit_setup_dept)
        val btnFinish: Button = findViewById(R.id.button_finish_setup)

        avatarImage.setOnClickListener { showPhotoOptions() }

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

    private fun showPhotoOptions() {
        val options = arrayOf("Take Photo", "Choose from Gallery")
        AlertDialog.Builder(this)
            .setItems(options) { _, which ->
                if (which == 0) openCamera() else openGallery()
            }
            .show()
    }

    private fun openCamera() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            capturedFile = File(getExternalFilesDir(Environment.DIRECTORY_PICTURES), "setup_temp_${System.currentTimeMillis()}.jpg")
            photoUri = FileProvider.getUriForFile(this, "com.example.cu_orbit.fileprovider", capturedFile!!)
            takePictureLauncher.launch(photoUri)
        } else {
            requestPermissionsLauncher.launch(arrayOf(Manifest.permission.CAMERA))
        }
    }

    private fun openGallery() {
        val permission = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            Manifest.permission.READ_MEDIA_IMAGES
        } else {
            Manifest.permission.READ_EXTERNAL_STORAGE
        }

        if (ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED) {
            pickImageLauncher.launch("image/*")
        } else {
            requestPermissionsLauncher.launch(arrayOf(permission))
        }
    }

    private fun uploadPhoto(file: File) {
        lifecycleScope.launch {
            try {
                val url = repository.uploadFile(file)
                if (url.isNotEmpty()) {
                    currentAvatarUrl = url
                    val absoluteUrl = RetrofitClient.getAbsoluteUrl(url)
                    avatarImage.load(absoluteUrl) {
                        crossfade(true)
                        placeholder(R.drawable.ic_person)
                    }
                }
            } catch (e: Exception) {
                Toast.makeText(this@ProfileSetupActivity, "Photo upload failed", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun getFileName(uri: Uri): String {
        var result: String? = null
        if (uri.scheme == "content") {
            contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (index != -1) result = cursor.getString(index)
                }
            }
        }
        return result ?: uri.path?.substringAfterLast('/') ?: "file.jpg"
    }

    private fun saveUriToLocalFile(uri: Uri, fileName: String): File? {
        return try {
            val destination = File(getExternalFilesDir(null), "setup_$fileName")
            contentResolver.openInputStream(uri)?.use { input ->
                destination.outputStream().use { output -> input.copyTo(output) }
            }
            destination
        } catch (e: Exception) { null }
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
                    "avatarUrl" to currentAvatarUrl,
                    "bio" to "Hey there! I am using CU Orbit."
                ))
                
                if (response["success"] == true) {
                    val prefs = getSharedPreferences("CU_ORBIT_PREFS", MODE_PRIVATE)
                    prefs.edit().apply {
                        putString("USER_NAME", name)
                        putString("USER_EMAIL", email)
                        putString("USER_ID", phone)
                        putString("USER_AVATAR", currentAvatarUrl)
                        putString("USER_BIO", "Hey there! I am using CU Orbit.")
                    }.apply()

                    Toast.makeText(this@ProfileSetupActivity, "Registration Successful", Toast.LENGTH_SHORT).show()
                    val intent = Intent(this@ProfileSetupActivity, MainActivity::class.java)
                    intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                    startActivity(intent)
                    finish()
                }
            } catch (e: Exception) {
                // Fallback
                val prefs = getSharedPreferences("CU_ORBIT_PREFS", MODE_PRIVATE)
                prefs.edit().apply {
                    putString("USER_NAME", name)
                    putString("USER_ID", phone)
                    putString("USER_AVATAR", currentAvatarUrl)
                }.apply()
                startActivity(Intent(this@ProfileSetupActivity, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
                finish()
            }
        }
    }
}