package com.example.cu_orbit.ui.dms

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.example.cu_orbit.R
import com.example.cu_orbit.data.User
import com.example.cu_orbit.data.Workspace
import com.example.cu_orbit.repository.MainRepository
import com.example.cu_orbit.ui.home.HomeAdapter
import kotlinx.coroutines.launch

class SelectContactFragment : Fragment() {

    private val repository = MainRepository()
    private lateinit var recyclerView: RecyclerView

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            loadAppUsers()
        } else {
            Toast.makeText(context, "Permission denied. You can still message registered users.", Toast.LENGTH_SHORT).show()
            loadAppUsers()
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_dms, container, false)
        
        recyclerView = root.findViewById(R.id.recycler_dms_only)
        recyclerView.layoutManager = LinearLayoutManager(context)

        checkAndRequestPermission()

        return root
    }

    private fun checkAndRequestPermission() {
        when {
            ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED -> {
                loadAppUsers()
            }
            shouldShowRequestPermissionRationale(Manifest.permission.READ_CONTACTS) -> {
                Toast.makeText(context, "Contact permission allows you to find your teammates", Toast.LENGTH_LONG).show()
                requestPermissionLauncher.launch(Manifest.permission.READ_CONTACTS)
            }
            else -> {
                requestPermissionLauncher.launch(Manifest.permission.READ_CONTACTS)
            }
        }
    }

    private fun loadAppUsers() {
        lifecycleScope.launch {
            try {
                // 1. Get registered users from DB
                val registeredUsers = repository.getUsers()
                val currentUserId = repository.getPrefs(requireContext()).getString("USER_ID", "")
                
                // 2. Get all local contacts
                val localContacts = mutableListOf<User>()
                if (ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED) {
                    val cursor = requireContext().contentResolver.query(
                        android.provider.ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                        null, null, null, null
                    )
                    cursor?.use {
                        val nameIdx = it.getColumnIndex(android.provider.ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
                        val phoneIdx = it.getColumnIndex(android.provider.ContactsContract.CommonDataKinds.Phone.NUMBER)
                        while (it.moveToNext()) {
                            val name = it.getString(nameIdx)
                            val phone = it.getString(phoneIdx).replace(" ", "").replace("-", "")
                            localContacts.add(User(id = phone, phone = phone, name = name))
                        }
                    }
                }

                // 3. Merge: Registered users first, then others to invite
                val displayList = mutableListOf<Any>()
                
                displayList.add("Contacts on CU Orbit")
                val appUsers = registeredUsers.filter { it.phone != currentUserId }
                displayList.addAll(appUsers)

                displayList.add("Invite to CU Orbit")
                val nonAppUsers = localContacts.filter { local ->
                    registeredUsers.none { reg -> reg.phone == local.phone }
                }.distinctBy { it.phone }.map { it.copy(status = "invite") }
                displayList.addAll(nonAppUsers)

                setupRecyclerView(displayList)
                
            } catch (e: Exception) {
                Toast.makeText(context, "Error loading contacts", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun setupRecyclerView(items: List<Any>) {
        recyclerView.adapter = HomeAdapter(
            onWorkspaceClick = { _ -> },
            onUserClick = { user ->
                val bundle = Bundle().apply {
                    putString("channelName", user.name)
                    putString("channelId", user.phone)
                }
                findNavController().navigate(R.id.navigation_chat, bundle)
            },
            onActionClick = { _ -> }
        ).apply { submitList(items) }
    }
}