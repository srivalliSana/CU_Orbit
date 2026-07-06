package com.example.cu_orbit.ui.chat

import android.os.Bundle
import android.widget.ImageButton
import android.widget.ImageView
import androidx.appcompat.app.AppCompatActivity
import coil.load
import com.example.cu_orbit.R

class FullImageActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_full_image)

        val imageUrl = intent.getStringExtra("IMAGE_URL")
        val imageView = findViewById<ImageView>(R.id.image_full_view)
        
        val absoluteUrl = com.example.cu_orbit.network.RetrofitClient.getAbsoluteUrl(imageUrl)
        imageView.load(absoluteUrl) {
            crossfade(true)
            placeholder(R.drawable.bg_orbit_gradient)
        }

        findViewById<ImageButton>(R.id.button_back_full).setOnClickListener {
            finish()
        }
    }
}