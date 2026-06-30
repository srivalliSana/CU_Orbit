package com.example.cu_orbit.ui.you

import android.content.Context
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.example.cu_orbit.R
import com.example.cu_orbit.repository.MainRepository
import com.google.android.material.chip.Chip
import com.google.android.material.chip.ChipGroup
import kotlinx.coroutines.launch

class EditProfileFragment : Fragment() {

    private val repository = MainRepository()
    private var initialName = ""
    private var initialBio = ""
    private var isChanged = false

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_edit_profile, container, false)

        val prefs = requireContext().getSharedPreferences("CU_ORBIT_PREFS", Context.MODE_PRIVATE)
        initialName = prefs.getString("USER_NAME", "User") ?: ""
        initialBio = prefs.getString("USER_BIO", "Hey there! I am using CU Orbit.") ?: ""

        val nameEdit: EditText = root.findViewById(R.id.edit_profile_name)
        val bioEdit: EditText = root.findViewById(R.id.edit_profile_bio)
        val saveButton: TextView = root.findViewById(R.id.button_save_profile)
        val toolbar: com.google.android.material.appbar.MaterialToolbar = root.findViewById(R.id.toolbar_edit_profile)
        val statusGroup: ChipGroup = root.findViewById(R.id.chip_group_status)

        nameEdit.setText(initialName)
        bioEdit.setText(initialBio)

        val textWatcher = object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                checkChanges(nameEdit.text.toString(), bioEdit.text.toString(), saveButton)
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
                updateProfile(nameEdit.text.toString(), bioEdit.text.toString())
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

    private fun checkChanges(name: String, bio: String, saveButton: TextView) {
        isChanged = name != initialName || bio != initialBio
        if (isChanged && name.isNotBlank()) {
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
                    0 -> Toast.makeText(context, "Camera coming soon", Toast.LENGTH_SHORT).show()
                    1 -> Toast.makeText(context, "Gallery coming soon", Toast.LENGTH_SHORT).show()
                    2 -> Toast.makeText(context, "Photo removed", Toast.LENGTH_SHORT).show()
                }
            }
            .show()
    }

    private fun updateProfile(name: String, bio: String) {
        lifecycleScope.launch {
            try {
                val prefs = requireContext().getSharedPreferences("CU_ORBIT_PREFS", Context.MODE_PRIVATE)
                val phone = prefs.getString("USER_ID", "") ?: ""
                
                // Update local prefs
                prefs.edit().apply {
                    putString("USER_NAME", name)
                    putString("USER_BIO", bio)
                }.apply()
                
                Toast.makeText(context, "Profile updated successfully", Toast.LENGTH_SHORT).show()
                findNavController().navigateUp()
            } catch (e: Exception) {
                Toast.makeText(context, "Error updating profile", Toast.LENGTH_SHORT).show()
            }
        }
    }
}