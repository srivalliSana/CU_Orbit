package com.example.cu_orbit.utils

import android.graphics.Typeface
import android.text.TextPaint
import android.text.style.ClickableSpan
import android.view.View
import com.example.cu_orbit.data.MentionMetadata

class MentionSpan(
    val mention: MentionMetadata,
    private val color: Int,
    private val onClick: (MentionMetadata) -> Unit
) : ClickableSpan() {

    override fun onClick(widget: View) {
        onClick(mention)
    }

    override fun updateDrawState(ds: TextPaint) {
        ds.color = color
        ds.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        ds.isUnderlineText = false
    }
}
