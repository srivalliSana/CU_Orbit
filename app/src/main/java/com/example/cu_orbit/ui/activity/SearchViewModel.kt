package com.example.cu_orbit.ui.activity

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.cu_orbit.data.SearchResponse
import com.example.cu_orbit.repository.MainRepository
import kotlinx.coroutines.launch

class SearchViewModel : ViewModel() {
    private val repository = MainRepository()

    private val _searchResults = MutableLiveData<SearchResponse>()
    val searchResults: LiveData<SearchResponse> = _searchResults

    fun performSearch(query: String, userId: String, workspaceId: String) {
        if (query.length < 2) return
        viewModelScope.launch {
            try {
                val results = repository.search(query, userId, workspaceId)
                _searchResults.postValue(results)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
}
