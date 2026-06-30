package com.example.cu_orbit.utils

import android.graphics.Typeface
import android.text.Spannable
import android.text.SpannableStringBuilder
import android.text.style.BackgroundColorSpan
import android.text.style.StyleSpan
import android.text.style.TypefaceSpan

object MarkdownUtils {
    fun formatMarkdown(text: String): SpannableStringBuilder {
        val builder = SpannableStringBuilder(text)
        
        // Bold: *text*
        applyRegex(builder, "\\*(.*?)\\*".toRegex(), StyleSpan(Typeface.BOLD))
        
        // Italic: _text_
        applyRegex(builder, "_(.*?)_".toRegex(), StyleSpan(Typeface.ITALIC))
        
        // Code: `text`
        applyRegex(builder, "`(.*?)`".toRegex()) {
            setSpan(TypefaceSpan("monospace"), 0, length, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
            setSpan(BackgroundColorSpan(0x33AAAAAA.toInt()), 0, length, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
        
        return builder
    }

    private fun applyRegex(builder: SpannableStringBuilder, regex: Regex, span: Any) {
        applyRegex(builder, regex) {
            setSpan(span, 0, length, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
    }

    private fun applyRegex(builder: SpannableStringBuilder, regex: Regex, spanAction: SpannableStringBuilder.() -> Unit) {
        var match = regex.find(builder)
        while (match != null) {
            val start = match.range.first
            val end = match.range.last + 1
            val content = match.groupValues[1]
            
            val formattedContent = SpannableStringBuilder(content)
            formattedContent.spanAction()
            
            builder.replace(start, end, formattedContent)
            match = regex.find(builder, start + formattedContent.length)
        }
    }
}