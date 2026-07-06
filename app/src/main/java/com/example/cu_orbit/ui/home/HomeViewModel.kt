package com.example.cu_orbit.ui.home

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.viewModelScope
import com.example.cu_orbit.data.*
import com.example.cu_orbit.repository.MainRepository
import kotlinx.coroutines.launch

class HomeViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = MainRepository()

    private val _workspaces = MutableLiveData<List<Workspace>>()
    val workspaces: LiveData<List<Workspace>> = _workspaces

    private val _activeWorkspace = MutableLiveData<Workspace?>()
    val activeWorkspace: LiveData<Workspace?> = _activeWorkspace

    private val _displayItems = MutableLiveData<List<Any>>()
    val displayItems: LiveData<List<Any>> = _displayItems

    private val _quickAccess = MutableLiveData<QuickAccessResponse>()
    
    init {
        loadInitialData()
    }

    private fun loadInitialData() {
        viewModelScope.launch {
            try {
                val wsList = repository.getWorkspaces()
                _workspaces.postValue(wsList)
                if (wsList.isNotEmpty()) {
                    val active = wsList.find { it.isActive } ?: wsList[0]
                    _activeWorkspace.postValue(active)
                    loadHomeFeed(active.id)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    fun switchWorkspace(workspace: Workspace) {
        _activeWorkspace.postValue(workspace)
        loadHomeFeed(workspace.id)
    }

    fun loadHomeFeed(workspaceId: String? = _activeWorkspace.value?.id) {
        val prefs = repository.getPrefs(getApplication<Application>().applicationContext)
        val userId = prefs.getString("USER_ID", "") ?: ""
        
        if (workspaceId == null) return

        viewModelScope.launch {
            try {
                // 1. Get quick access counts
                val quick = try { repository.getQuickAccessCounts(userId) } catch(e: Exception) { QuickAccessResponse(0,0,0) }
                _quickAccess.postValue(quick)

                // 2. Get Home Feed (Channels + DMs)
                val feed = repository.getHomeFeed(userId, workspaceId)
                
                // 3. Assemble Display List
                val items = mutableListOf<Any>()
                
                // Quick Access Section (3.3)
                items.add(QuickAccessItem("threads", "Threads", com.example.cu_orbit.R.drawable.ic_threads, quick.threads, quick.threads > 0))
                items.add(QuickAccessItem("mentions", "Mentions", com.example.cu_orbit.R.drawable.ic_mentions, quick.mentions, quick.mentions > 0))

                // Channels Section (3.4)
                items.add("CHANNELS")
                if (feed.channels.isEmpty()) {
                    items.add(EmptyStateItem("channels", "You haven't joined any channels yet.", android.R.drawable.ic_menu_send))
                } else {
                    items.addAll(feed.channels.sortedByDescending { it.lastMessagePreview?.sentAt ?: 0 })
                }

                // DMs Section (3.5)
                items.add("DIRECT MESSAGES")
                if (feed.dms.isEmpty()) {
                    items.add(EmptyStateItem("dms", "No conversations yet.", android.R.drawable.stat_notify_chat))
                } else {
                    items.addAll(feed.dms.sortedByDescending { it.lastMessagePreview?.sentAt ?: 0 })
                }

                _displayItems.postValue(items)

            } catch (e: Exception) {
                android.util.Log.e("HomeViewModel", "Error loading feed", e)
                _displayItems.postValue(listOf("CHANNELS", "Server connection failed.", "DIRECT MESSAGES", "Check your settings."))
            }
        }
    }
}
