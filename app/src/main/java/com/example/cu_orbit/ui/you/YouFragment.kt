package com.example.cu_orbit.ui.you

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.example.cu_orbit.R
import coil.load
import com.example.cu_orbit.repository.MainRepository
import com.google.android.material.imageview.ShapeableImageView
import kotlinx.coroutines.launch

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

        root.findViewById<View>(R.id.card_update_status).setOnClickListener {
            findNavController().navigate(R.id.navigation_edit_profile)
        }

        // Set Status button (icon below the name)
        root.findViewById<ViewGroup>(R.id.layout_set_status_trigger)?.setOnClickListener {
            findNavController().navigate(R.id.navigation_edit_profile)
        }

        root.findViewById<View>(R.id.option_download_apk).setOnClickListener {
            com.example.cu_orbit.utils.AppUtils.shareAppAPK(requireContext())
        }

        return root
    }

    override fun onResume() {
        super.onResume()
        view?.let { setupProfile(it) }
    }

    private fun setupProfile(root: View) {
        val prefs = requireContext().getSharedPreferences("CU_ORBIT_PREFS", android.content.Context.MODE_PRIVATE)
        val name = prefs.getString("USER_NAME", "User")
        val phone = prefs.getString("USER_ID", "")
        val bio = prefs.getString("USER_BIO", "Update your status")
        val avatarUrl = prefs.getString("USER_AVATAR", "")
        
        root.findViewById<TextView>(R.id.profile_name).text = name
        root.findViewById<TextView>(R.id.profile_handle).text = "@${name?.lowercase()?.replace(" ", "_")}"
        val displayPhone = if (phone?.startsWith("+") == true) phone else "+91 $phone"
        root.findViewById<TextView>(R.id.profile_phone).text = displayPhone
        
        root.findViewById<TextView>(R.id.text_status_body).text = bio
        
        val profileImage = root.findViewById<ShapeableImageView>(R.id.profile_avatar)
        val absoluteAvatarUrl = com.example.cu_orbit.network.RetrofitClient.getAbsoluteUrl(avatarUrl)
        if (absoluteAvatarUrl != null && absoluteAvatarUrl.isNotEmpty()) {
            profileImage.load(absoluteAvatarUrl) {
                crossfade(true)
                placeholder(R.drawable.ic_person)
                error(R.drawable.ic_person)
            }
        }
    }
}