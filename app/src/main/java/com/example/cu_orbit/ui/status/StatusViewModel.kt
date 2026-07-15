package com.example.cu_orbit.ui.status

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cu_orbit.data.Status
import com.example.cu_orbit.repository.MainRepository
import kotlinx.coroutines.launch

class StatusViewModel : ViewModel() {
    private val repository = MainRepository()

    private val _statuses = MutableLiveData<List<Status>>()
    val statuses: LiveData<List<Status>> = _statuses

    fun loadStatuses() {
        viewModelScope.launch {
            try {
                val fetched = repository.getStatuses()
                _statuses.postValue(fetched)
            } catch (e: Exception) {
                _statuses.postValue(emptyList())
            }
        }
    }

    fun postStatus(userId: String, userName: String, type: String, mediaUrl: String, caption: String?, mentions: List<String>? = null) {
        viewModelScope.launch {
            try {
                repository.postStatus(userId, userName, type, mediaUrl, caption, mentions)
                loadStatuses()
            } catch (e: Exception) {
                // handle error
            }
        }
    }
}