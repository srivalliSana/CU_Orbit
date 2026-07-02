package com.example.cu_orbit.ui.status

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import coil.load
import com.example.cu_orbit.R

class StatusViewActivity : AppCompatActivity() {

    private val handler = Handler(Looper.getMainLooper())
    private var progress = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_status_view)

        val userName = intent.getStringExtra("USER_NAME")
        val mediaUrl = intent.getStringExtra("MEDIA_URL")
        val caption = intent.getStringExtra("CAPTION")

        findViewById<TextView>(R.id.text_status_user).text = userName
        findViewById<TextView>(R.id.text_status_caption).text = caption
        findViewById<ImageView>(R.id.image_status_full).load(mediaUrl)

        findViewById<ImageButton>(R.id.button_close_status).setOnClickListener {
            finish()
        }

        startTimer()
    }

    private fun startTimer() {
        val progressBar = findViewById<ProgressBar>(R.id.status_timer_progress)
        val runnable = object : Runnable {
            override fun run() {
                progress += 1
                progressBar.progress = progress
                if (progress < 100) {
                    handler.postDelayed(this, 30) // 3 seconds total
                } else {
                    finish()
                }
            }
        }
        handler.post(runnable)
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacksAndMessages(null)
    }
}