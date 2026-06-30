package com.example.cu_orbit.ui.search

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import com.example.cu_orbit.R
import com.google.android.material.search.SearchBar
import com.google.android.material.search.SearchView

class SearchFragment : Fragment() {

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val root = inflater.inflate(R.layout.fragment_search, container, false)
        
        val searchBar: SearchBar = root.findViewById(R.id.search_bar)
        val searchView: SearchView = root.findViewById(R.id.search_view)
        
        searchView.setupWithSearchBar(searchBar)
        
        return root
    }
}