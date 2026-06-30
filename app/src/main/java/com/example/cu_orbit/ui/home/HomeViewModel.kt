package com.example.cu_orbit.ui.home

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cu_orbit.data.Channel
import com.example.cu_orbit.data.User
import com.example.cu_orbit.repository.MainRepository
import kotlinx.coroutines.launch
import android.app.Application
import androidx.lifecycle.AndroidViewModel

class HomeViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = MainRepository()
    private val context = application.applicationContext

    private val _channels = MutableLiveData<List<Channel>>()
    val channels: LiveData<List<Channel>> = _channels

    private val _users = MutableLiveData<List<User>>()
    val users: LiveData<List<User>> = _users

    fun loadData() {
        viewModelScope.launch {
            try {
                // 1. Load Channels
                val fetchedChannels = repository.getChannels()
                if (fetchedChannels.isNotEmpty()) {
                    _channels.postValue(fetchedChannels)
                } else {
                    // If no channels, create 'general' and reload
                    try {
                        repository.createChannel("general", false, "University-wide announcements")
                        _channels.postValue(repository.getChannels())
                    } catch (e: Exception) {
                        _channels.postValue(emptyList())
                    }
                }

                // 2. Load Users (Peers)
                val fetchedUsers = repository.getUsers()
                val prefs = repository.getPrefs(context)
                val currentUserId = prefs.getString("USER_ID", "")
                
                val userListWithLastMsg = fetchedUsers.filter { it.phone != currentUserId }.map { user ->
                    val messages = repository.getMessages(if (currentUserId!! < user.phone) "${currentUserId}_${user.phone}" else "${user.phone}_$currentUserId")
                    val lastMsg = messages.lastOrNull()
                    val unreadCount = messages.count { it.senderId != currentUserId && it.status != "read" }
                    
                    user.copy(
                        lastMessagePreview = lastMsg?.body ?: "",
                        lastMessageTime = if (lastMsg != null) java.text.SimpleDateFormat("h:mm a", java.util.Locale.getDefault()).format(java.util.Date(lastMsg.timestamp)) else "",
                        unreadCount = unreadCount
                    )
                }
                
                _users.postValue(userListWithLastMsg)

            } catch (e: Exception) {
                // Log or handle network error
            }
        }
    }
}