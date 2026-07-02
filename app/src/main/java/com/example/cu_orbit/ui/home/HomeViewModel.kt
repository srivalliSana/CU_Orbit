package com.example.cu_orbit.ui.home

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
import com.example.cu_orbit.data.User
import com.example.cu_orbit.data.Workspace
import com.example.cu_orbit.repository.MainRepository
import kotlinx.coroutines.launch
import android.app.Application
import androidx.lifecycle.AndroidViewModel

class HomeViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = MainRepository()

    private val _workspaces = MutableLiveData<List<Workspace>>()
    val workspaces: LiveData<List<Workspace>> = _workspaces

    private val _users = MutableLiveData<List<User>>()
    val users: LiveData<List<User>> = _users

    fun loadData() {
        val prefs = repository.getPrefs(getApplication<Application>().applicationContext)
        val currentUserId = prefs.getString("USER_ID", "") ?: ""

        // Load Workspaces
        viewModelScope.launch {
            try {
                val fetched = repository.getWorkspaces()
                _workspaces.postValue(fetched)
            } catch (e: Exception) {
                _workspaces.postValue(emptyList())
            }
        }

        // Load DMs
        if (currentUserId.isNotEmpty()) {
            viewModelScope.launch {
                try {
                    val inbox = repository.getInbox(currentUserId)
                    _users.postValue(inbox)
                } catch (e: Exception) {
                    _users.postValue(emptyList())
                }
            }
        }
    }
}
