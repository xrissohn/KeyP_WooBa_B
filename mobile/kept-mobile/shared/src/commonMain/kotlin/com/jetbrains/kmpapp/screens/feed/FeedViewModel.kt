package com.jetbrains.kmpapp.screens.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jetbrains.kmpapp.data.FeedRepository
import com.jetbrains.kmpapp.model.FeedItem
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

sealed interface FeedUiState { data object Loading : FeedUiState; data class Content(val items: List<FeedItem>) : FeedUiState; data class Error(val message: String) : FeedUiState }
class FeedViewModel(private val repository: FeedRepository) : ViewModel() { val uiState: StateFlow<FeedUiState> = repository.items.map { FeedUiState.Content(it) as FeedUiState }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), FeedUiState.Loading); init { refresh() }; fun refresh() = viewModelScope.launch { runCatching { repository.refresh() } }; fun onBookmark(id: String) = repository.toggleBookmark(id) }
