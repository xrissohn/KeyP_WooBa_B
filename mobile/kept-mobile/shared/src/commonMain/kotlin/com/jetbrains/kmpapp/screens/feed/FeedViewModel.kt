package com.jetbrains.kmpapp.screens.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jetbrains.kmpapp.data.FeedRepository
import com.jetbrains.kmpapp.data.KeypApiException
import com.jetbrains.kmpapp.model.FeedItem
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface FeedUiState {
    data object Loading : FeedUiState
    data class Content(val items: List<FeedItem>) : FeedUiState
    data class Error(val message: String) : FeedUiState
}

class FeedViewModel(private val repository: FeedRepository) : ViewModel() {
    private val _uiState = MutableStateFlow<FeedUiState>(FeedUiState.Loading)
    val uiState = _uiState.asStateFlow()

    init {
        viewModelScope.launch { repository.items.collect { _uiState.value = FeedUiState.Content(it) } }
        refresh()
    }

    fun refresh() = viewModelScope.launch {
        runCatching { repository.refresh() }.onFailure { _uiState.value = FeedUiState.Error(it.toUserMessage()) }
    }

    fun onBookmark(id: String) = repository.toggleBookmark(id)
}

private fun Throwable.toUserMessage(): String = when (this) {
    is KeypApiException -> message ?: "새 소식을 불러오지 못했어요. 다시 시도해 주세요."
    else -> "새 소식을 불러오지 못했어요. 네트워크를 확인하고 다시 시도해 주세요."
}
