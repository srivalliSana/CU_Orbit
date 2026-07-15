package com.example.cu_orbit.ui.status

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.fragment.app.Fragment
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.cu_orbit.R
import com.example.cu_orbit.repository.MainRepository
import kotlinx.coroutines.launch
import java.io.File

class StatusFragment : Fragment() {

    private lateinit var viewModel: StatusViewModel
    private val repository = MainRepository()

    private val pickStatusLauncher = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let {
            uploadStatus(it)
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_status, container, false)

        viewModel = ViewModelProvider(this)[StatusViewModel::class.java]

        val recyclerView: RecyclerView = root.findViewById(R.id.recycler_status)
        recyclerView.layoutManager = LinearLayoutManager(context)

        viewModel.statuses.observe(viewLifecycleOwner) { statuses ->
            recyclerView.adapter = StatusAdapter(statuses) { status ->
                val intent = android.content.Intent(context, StatusViewActivity::class.java).apply {
                    putExtra("USER_NAME", status.userName)
                    putExtra("MEDIA_URL", status.mediaUrl)
                    putExtra("CAPTION", status.caption)
                }
                startActivity(intent)
            }
        }

        root.findViewById<View>(R.id.layout_my_status).setOnClickListener {
            pickStatusLauncher.launch("image/*")
        }

        root.findViewById<View>(R.id.fab_status_camera).setOnClickListener {
            Toast.makeText(context, "Camera status coming soon!", Toast.LENGTH_SHORT).show()
        }

        viewModel.loadStatuses()

        return root
    }

    override fun onResume() {
        super.onResume()
        viewModel.loadStatuses()
    }

    private fun uploadStatus(uri: android.net.Uri) {
        lifecycleScope.launch {
            try {
                val prefs = repository.getPrefs(requireContext())
                val userId = prefs.getString("USER_ID", "anonymous") ?: "anonymous"
                val userName = prefs.getString("USER_NAME", "User") ?: "User"

                val file = File(requireContext().cacheDir, "status_${System.currentTimeMillis()}.jpg")
                requireContext().contentResolver.openInputStream(uri)?.use { input ->
                    file.outputStream().use { output -> input.copyTo(output) }
                }

                Toast.makeText(context, "Uploading status...", Toast.LENGTH_SHORT).show()
                val serverUrl = repository.uploadFile(file)
                
                if (serverUrl.isNotEmpty()) {
                    showTaggingDialog(userId, userName, serverUrl)
                } else {
                    Toast.makeText(context, "Server did not return a valid URL", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                android.util.Log.e("StatusFragment", "Upload error: ${e.message}", e)
                Toast.makeText(context, "Failed to post status: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun showTaggingDialog(userId: String, userName: String, serverUrl: String) {
        lifecycleScope.launch {
            try {
                val users = repository.getUsers().filter { it.phone != userId }
                val names = users.map { u ->
                    val contact = com.example.cu_orbit.utils.ContactUtils.getContactName(requireContext(), u.phone)
                    contact ?: u.name
                }.toTypedArray()

                val checkedItems = BooleanArray(users.size) { false }

                androidx.appcompat.app.AlertDialog.Builder(requireContext())
                    .setTitle("Secretly tag up to 5 people")
                    .setMultiChoiceItems(names, checkedItems) { _, which, isChecked ->
                        checkedItems[which] = isChecked
                    }
                    .setPositiveButton("Post") { _, _ ->
                        val selectedPhones = mutableListOf<String>()
                        for (i in checkedItems.indices) {
                            if (checkedItems[i]) selectedPhones.add(users[i].phone)
                        }
                        val limitedTagging = selectedPhones.take(5)
                        viewModel.postStatus(userId, userName, "image", serverUrl, null, limitedTagging)
                        Toast.makeText(context, "Status update posted!", Toast.LENGTH_SHORT).show()
                    }
                    .setNegativeButton("Skip") { _, _ ->
                        viewModel.postStatus(userId, userName, "image", serverUrl, null, null)
                        Toast.makeText(context, "Status update posted!", Toast.LENGTH_SHORT).show()
                    }
                    .show()
            } catch (e: Exception) {
                viewModel.postStatus(userId, userName, "image", serverUrl, null, null)
            }
        }
    }
}
