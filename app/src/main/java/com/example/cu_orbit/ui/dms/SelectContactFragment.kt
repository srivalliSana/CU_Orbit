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
import com.example.cu_orbit.data.DirectMessage
import com.example.cu_orbit.repository.MainRepository
import com.example.cu_orbit.ui.home.HomeAdapter
import kotlinx.coroutines.launch

class SelectContactFragment : Fragment() {

    private val repository = MainRepository()
    private lateinit var recyclerView: RecyclerView
    private val registeredPhones = mutableSetOf<String>()

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

    private var fullDisplayList = mutableListOf<Any>()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_select_contact, container, false)
        
        recyclerView = root.findViewById(R.id.recycler_contacts)
        recyclerView.layoutManager = LinearLayoutManager(context)

        root.findViewById<View>(R.id.button_back).setOnClickListener {
            findNavController().navigateUp()
        }

        val editSearch: android.widget.EditText = root.findViewById(R.id.edit_search_contacts)
        editSearch.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                filterContacts(s.toString())
            }
            override fun afterTextChanged(s: android.text.Editable?) {}
        })

        checkAndRequestPermission()

        return root
    }

    private fun filterContacts(query: String) {
        if (query.isEmpty()) {
            setupRecyclerView(fullDisplayList)
            return
        }
        val lower = query.lowercase()
        val filtered = mutableListOf<Any>()
        
        var currentHeader: String? = null
        var hasContentForHeader = false
        
        for (item in fullDisplayList) {
            if (item is String) {
                currentHeader = item
                hasContentForHeader = false
            } else if (item is User) {
                if (item.name.lowercase().contains(lower) || (item.phone ?: "").contains(lower)) {
                    if (currentHeader != null && !hasContentForHeader) {
                        filtered.add(currentHeader)
                        hasContentForHeader = true
                    }
                    filtered.add(item)
                }
            }
        }
        setupRecyclerView(filtered)
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
                            localContacts.add(User(id = phone, phone = phone, name = name, handle = phone))
                        }
                    }
                }

                // 3. Merge: Registered users first, then others to invite
                val displayList = mutableListOf<Any>()
                
                displayList.add("Contacts on CU Orbit")
                val appUsers = registeredUsers.map { u ->
                    if (u.phone == currentUserId) {
                        u.copy(name = "You (Message Yourself)")
                    } else {
                        val contactName = u.phone?.let { com.example.cu_orbit.utils.ContactUtils.getContactName(requireContext(), it) }
                        u.copy(name = contactName ?: u.name)
                    }
                }
                registeredPhones.clear()
                registeredPhones.addAll(registeredUsers.mapNotNull { it.phone })
                displayList.addAll(appUsers)

                displayList.add("Invite to CU Orbit")
                val nonAppUsers = localContacts.filter { local ->
                    registeredUsers.none { reg -> reg.phone == local.phone }
                }.distinctBy { it.phone }.map { it.copy(presence = "offline") }
                displayList.addAll(nonAppUsers)

                fullDisplayList = displayList
                setupRecyclerView(displayList)
                
            } catch (e: Exception) {
                Toast.makeText(context, "Error loading contacts", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun setupRecyclerView(items: List<Any>) {
        recyclerView.adapter = HomeAdapter(
            onWorkspaceClick = { _ -> },
            onChannelClick = { _ -> },
            onUserClick = { dm ->
                // Clean phone numbers for comparison (remove non-digits)
                val otherPhoneClean = dm.otherUserId.filter { it.isDigit() }.takeLast(10)
                val isRegistered = registeredPhones.any { it.filter { c -> c.isDigit() }.takeLast(10) == otherPhoneClean }

                if (isRegistered) {
                    val bundle = Bundle().apply {
                        putString("channelName", dm.otherUserName)
                        putString("channelId", dm.id)
                    }
                    findNavController().navigate(R.id.navigation_chat, bundle)
                } else {
                    inviteUser(dm.otherUserId)
                }
            },
            onActionClick = { _ -> }
        ).apply { submitList(items) }
    }

    private fun inviteUser(phone: String) {
        val options = arrayOf("Invite via SMS", "Send App APK directly")
        androidx.appcompat.app.AlertDialog.Builder(requireContext())
            .setTitle("Invite Teammate")
            .setItems(options) { _, which ->
                if (which == 0) {
                    try {
                        val intent = android.content.Intent(android.content.Intent.ACTION_VIEW).apply {
                            data = android.net.Uri.parse("sms:$phone")
                            putExtra("sms_body", "Hey! Join me on CU Orbit university messaging app. Download it now to collaborate with our teammates.")
                        }
                        startActivity(intent)
                    } catch (e: Exception) {
                        Toast.makeText(context, "Could not open SMS app", Toast.LENGTH_SHORT).show()
                    }
                } else {
                    com.example.cu_orbit.utils.AppUtils.shareAppAPK(requireContext())
                }
            }
            .show()
    }
}
