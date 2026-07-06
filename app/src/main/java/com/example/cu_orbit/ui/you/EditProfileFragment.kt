package com.example.cu_orbit.ui.you

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.OpenableColumns
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import coil.load
import com.example.cu_orbit.R
import com.example.cu_orbit.repository.MainRepository
import com.google.android.material.chip.Chip
import com.google.android.material.chip.ChipGroup
import kotlinx.coroutines.launch
import java.io.File

class EditProfileFragment : Fragment() {

    private val repository = MainRepository()
    private var initialName = ""
    private var initialBio = ""
    private var initialAvatar = ""
    private var currentAvatarUrl = ""
    private var isChanged = false

    private lateinit var avatarImage: ImageView
    private lateinit var nameEdit: EditText
    private lateinit var bioEdit: EditText
    private lateinit var saveButton: TextView

    private var capturedFile: File? = null
    private var photoUri: Uri? = null

    private val requestPermissionsLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (permissions.values.all { it }) {
            // Permissions granted
        } else {
            Toast.makeText(context, "Permissions required to change photo", Toast.LENGTH_SHORT).show()
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

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_edit_profile, container, false)

        val prefs = requireContext().getSharedPreferences("CU_ORBIT_PREFS", Context.MODE_PRIVATE)
        initialName = prefs.getString("USER_NAME", "User") ?: ""
        initialBio = prefs.getString("USER_BIO", "Hey there! I am using CU Orbit.") ?: ""
        initialAvatar = prefs.getString("USER_AVATAR", "") ?: ""
        currentAvatarUrl = initialAvatar

        avatarImage = root.findViewById(R.id.edit_profile_avatar)
        nameEdit = root.findViewById(R.id.edit_profile_name)
        bioEdit = root.findViewById(R.id.edit_profile_bio)
        saveButton = root.findViewById(R.id.button_save_profile)
        val toolbar: com.google.android.material.appbar.MaterialToolbar = root.findViewById(R.id.toolbar_edit_profile)
        val statusGroup: ChipGroup = root.findViewById(R.id.chip_group_status)

        nameEdit.setText(initialName)
        bioEdit.setText(initialBio)
        
        if (initialAvatar.isNotEmpty()) {
            val absoluteAvatar = com.example.cu_orbit.network.RetrofitClient.getAbsoluteUrl(initialAvatar)
            avatarImage.load(absoluteAvatar) {
                crossfade(true)
                placeholder(R.drawable.ic_person)
                error(R.drawable.ic_person)
            }
        }

        val textWatcher = object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                checkChanges()
            }
            override fun afterTextChanged(s: Editable?) {}
        }

        nameEdit.addTextChangedListener(textWatcher)
        bioEdit.addTextChangedListener(textWatcher)

        statusGroup.setOnCheckedStateChangeListener { group, checkedIds ->
            if (checkedIds.isNotEmpty()) {
                val chip = group.findViewById<Chip>(checkedIds[0])
                bioEdit.setText(chip.text)
            }
        }

        saveButton.setOnClickListener {
            if (isChanged) {
                updateProfile(nameEdit.text.toString(), bioEdit.text.toString(), currentAvatarUrl)
            }
        }

        toolbar.setNavigationOnClickListener {
            handleBackPress()
        }

        root.findViewById<View>(R.id.button_change_photo).setOnClickListener {
            showPhotoOptions()
        }

        requireActivity().onBackPressedDispatcher.addCallback(viewLifecycleOwner, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                handleBackPress()
            }
        })

        return root
    }

    private fun checkChanges() {
        val currentName = nameEdit.text.toString()
        val currentBio = bioEdit.text.toString()
        isChanged = currentName != initialName || currentBio != initialBio || currentAvatarUrl != initialAvatar
        
        if (isChanged && currentName.isNotBlank()) {
            saveButton.alpha = 1.0f
            saveButton.isEnabled = true
        } else {
            saveButton.alpha = 0.5f
            saveButton.isEnabled = false
        }
    }

    private fun handleBackPress() {
        if (isChanged) {
            AlertDialog.Builder(requireContext())
                .setTitle("Discard unsaved changes?")
                .setMessage("Are you sure you want to discard your changes?")
                .setPositiveButton("Discard") { _, _ -> findNavController().navigateUp() }
                .setNegativeButton("Keep Editing", null)
                .show()
        } else {
            findNavController().navigateUp()
        }
    }

    private fun showPhotoOptions() {
        val options = arrayOf("Take Photo", "Choose from Gallery", "Remove Photo")
        AlertDialog.Builder(requireContext())
            .setItems(options) { _, which ->
                when (which) {
                    0 -> openCamera()
                    1 -> openGallery()
                    2 -> removePhoto()
                }
            }
            .show()
    }

    private fun openCamera() {
        if (ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            capturedFile = File(requireContext().getExternalFilesDir(Environment.DIRECTORY_PICTURES), "profile_temp_${System.currentTimeMillis()}.jpg")
            photoUri = FileProvider.getUriForFile(requireContext(), "com.example.cu_orbit.fileprovider", capturedFile!!)
            takePictureLauncher.launch(photoUri)
        } else {
            requestPermissionsLauncher.launch(arrayOf(Manifest.permission.CAMERA))
        }
    }

    private fun openGallery() {
        val permission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            Manifest.permission.READ_MEDIA_IMAGES
        } else {
            Manifest.permission.READ_EXTERNAL_STORAGE
        }

        if (ContextCompat.checkSelfPermission(requireContext(), permission) == PackageManager.PERMISSION_GRANTED) {
            pickImageLauncher.launch("image/*")
        } else {
            requestPermissionsLauncher.launch(arrayOf(permission))
        }
    }

    private fun removePhoto() {
        currentAvatarUrl = ""
        avatarImage.setImageResource(R.drawable.ic_person)
        checkChanges()
    }

    private fun uploadPhoto(file: File) {
        lifecycleScope.launch {
            try {
                val url = repository.uploadFile(file)
                if (url.isNotEmpty()) {
                    currentAvatarUrl = url
                    val absoluteAvatar = com.example.cu_orbit.network.RetrofitClient.getAbsoluteUrl(url)
                    avatarImage.load(absoluteAvatar) {
                        crossfade(true)
                        placeholder(R.drawable.ic_person)
                        error(R.drawable.ic_person)
                    }
                    checkChanges()
                }
            } catch (e: Exception) {
                Toast.makeText(context, "Failed to upload photo", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun getFileName(uri: Uri): String {
        var result: String? = null
        if (uri.scheme == "content") {
            requireContext().contentResolver.query(uri, null, null, null, null)?.use { cursor ->
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
            val destination = File(requireContext().getExternalFilesDir(null), "profile_$fileName")
            requireContext().contentResolver.openInputStream(uri)?.use { input ->
                destination.outputStream().use { output -> input.copyTo(output) }
            }
            destination
        } catch (e: Exception) { null }
    }

    private fun updateProfile(name: String, bio: String, avatarUrl: String) {
        lifecycleScope.launch {
            try {
                val prefs = requireContext().getSharedPreferences("CU_ORBIT_PREFS", Context.MODE_PRIVATE)
                val phone = prefs.getString("USER_ID", "") ?: ""
                
                if (phone.isEmpty()) {
                    Toast.makeText(context, "Error: User ID not found. Please log in again.", Toast.LENGTH_LONG).show()
                    return@launch
                }

                // Update server
                val result = repository.updateUser(phone, name, bio, avatarUrl)
                
                if (result["success"] == true) {
                    // Update local prefs
                    prefs.edit().apply {
                        putString("USER_NAME", name)
                        putString("USER_BIO", bio)
                        putString("USER_AVATAR", avatarUrl)
                    }.apply()
                    
                    Toast.makeText(context, "Profile updated successfully", Toast.LENGTH_SHORT).show()
                    findNavController().navigateUp()
                } else {
                    Toast.makeText(context, "Server failed to update profile", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                e.printStackTrace()
                Toast.makeText(context, "Update failed: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }
}
