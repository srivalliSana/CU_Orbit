package com.example.cu_orbit.ui.chat

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cu_orbit.data.Message
import com.example.cu_orbit.data.MessageRequest
import com.example.cu_orbit.data.TypingStatus
import com.example.cu_orbit.repository.MainRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class ChatViewModel : ViewModel() {
    private val repository = MainRepository()

    private val _messages = MutableLiveData<List<Message>>()
    val messages: LiveData<List<Message>> = _messages

    private val _threadReplies = MutableLiveData<List<Message>>()
    val threadReplies: LiveData<List<Message>> = _threadReplies

    private val _typingUsers = MutableLiveData<List<TypingStatus>>()
    val typingUsers: LiveData<List<TypingStatus>> = _typingUsers

    private var pollingJob: kotlinx.coroutines.Job? = null

    fun startPolling(channelId: String, currentUserId: String? = null) {
        stopPolling()
        pollingJob = viewModelScope.launch {
            while (isActive) {
                loadMessages(channelId, currentUserId)
                loadTyping(channelId)
                delay(3000)
            }
        }
    }

    fun startThreadPolling(messageId: String) {
        stopPolling()
        pollingJob = viewModelScope.launch {
            while (isActive) {
                loadReplies(messageId)
                delay(3000)
            }
        }
    }

    fun stopPolling() {
        pollingJob?.cancel()
    }

    suspend fun loadMessages(channelId: String, currentUserId: String? = null) {
        try {
            val result = repository.getMessages(channelId)
            _messages.postValue(result)
            
            currentUserId?.let { uid ->
                result.filter { it.senderId != uid && it.status != "read" }.forEach { msg ->
                    markAsRead(msg.id)
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun markAsRead(messageId: String) {
        viewModelScope.launch {
            try {
                repository.editMessage(messageId, null, "read")
            } catch (e: Exception) {}
        }
    }

    private suspend fun loadReplies(messageId: String) {
        try {
            val result = repository.getReplies(messageId)
            _threadReplies.postValue(result)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private suspend fun loadTyping(channelId: String) {
        try {
            val result = repository.getTyping(channelId)
            _typingUsers.postValue(result)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun notifyTyping(channelId: String, userId: String, userName: String) {
        viewModelScope.launch {
            try {
                repository.updateTyping(channelId, userId, userName)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    fun sendMessage(request: MessageRequest) {
        viewModelScope.launch {
            try {
                repository.sendMessage(request)
                loadMessages(request.channelId)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    fun editMessage(message: Message, newBody: String) {
        viewModelScope.launch {
            try {
                repository.editMessage(message.id, newBody)
                val cid = message.channelId ?: message.dmId ?: ""
                loadMessages(cid)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    fun reactToMessage(message: Message, userId: String, userName: String, emoji: String) {
        viewModelScope.launch {
            try {
                repository.reactToMessage(message.id, userId, userName, emoji)
                val cid = message.channelId ?: message.dmId ?: ""
                loadMessages(cid)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    fun deleteMessage(message: Message) {
        viewModelScope.launch {
            try {
                repository.deleteMessage(message.id)
                val cid = message.channelId ?: message.dmId ?: ""
                loadMessages(cid)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        stopPolling()
    }
}
