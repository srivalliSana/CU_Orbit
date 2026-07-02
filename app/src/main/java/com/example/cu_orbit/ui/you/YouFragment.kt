package com.example.cu_orbit.ui.you

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.navigation.fragment.findNavController
import com.example.cu_orbit.R
import coil.load
import com.google.android.material.imageview.ShapeableImageView

class YouFragment : Fragment() {

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_you, container, false)
        setupProfile(root)

        root.findViewById<View>(R.id.option_preferences).setOnClickListener {
            findNavController().navigate(R.id.navigation_settings)
        }

        root.findViewById<View>(R.id.layout_edit_profile_trigger).setOnClickListener {
            findNavController().navigate(R.id.navigation_edit_profile)
        }

        root.findViewById<View>(R.id.option_download_apk).setOnClickListener {
            com.example.cu_orbit.utils.AppUtils.shareAppAPK(requireContext())
        }

        return root
    }

    private fun setupProfile(root: View) {
        val prefs = requireContext().getSharedPreferences("CU_ORBIT_PREFS", android.content.Context.MODE_PRIVATE)
        val name = prefs.getString("USER_NAME", "User")
        val phone = prefs.getString("USER_ID", "")
        val email = prefs.getString("USER_EMAIL", "No email provided")
        val avatarUrl = prefs.getString("USER_AVATAR", "")
        
        root.findViewById<TextView>(R.id.profile_name).text = name
        root.findViewById<TextView>(R.id.profile_handle).text = "@${name?.lowercase()?.replace(" ", "_")}"
        
        val profileImage = root.findViewById<ShapeableImageView>(R.id.profile_avatar)
        if (avatarUrl != null && avatarUrl.isNotEmpty()) {
            profileImage.load(avatarUrl) {
                crossfade(true)
                placeholder(R.drawable.ic_person)
                error(R.drawable.ic_person)
            }
        }
        
        android.util.Log.d("YouFragment", "Profile: $name, $phone, $email")
    }
}