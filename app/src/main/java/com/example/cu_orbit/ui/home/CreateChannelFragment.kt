package com.example.cu_orbit.ui.home

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.example.cu_orbit.R
import com.example.cu_orbit.repository.MainRepository
import com.google.android.material.materialswitch.MaterialSwitch
import com.google.android.material.textfield.TextInputEditText
import kotlinx.coroutines.launch

class CreateChannelFragment : Fragment() {

    private val repository = MainRepository()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_create_channel, container, false)

        val editName: TextInputEditText = root.findViewById(R.id.edit_channel_name)
        val editDesc: TextInputEditText = root.findViewById(R.id.edit_channel_desc)
        val switchPrivate: MaterialSwitch = root.findViewById(R.id.switch_private)
        val btnCreate: Button = root.findViewById(R.id.button_create)

        btnCreate.setOnClickListener {
            val name = editName.text.toString().trim()
            val desc = editDesc.text.toString().trim()
            val isPrivate = switchPrivate.isChecked

            if (name.isNotEmpty()) {
                createChannel(name, isPrivate, desc)
            } else {
                Toast.makeText(context, "Please enter a name", Toast.LENGTH_SHORT).show()
            }
        }

        return root
    }

    private fun createChannel(name: String, isPrivate: Boolean, description: String) {
        lifecycleScope.launch {
            try {
                repository.createChannel(name, isPrivate, description)
                Toast.makeText(context, "Channel #$name created!", Toast.LENGTH_SHORT).show()
                findNavController().navigateUp()
            } catch (e: Exception) {
                Toast.makeText(context, "Error creating channel: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }
}