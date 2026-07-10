package com.jetbrains.kmpapp.screens.bookmarks

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jetbrains.kmpapp.data.BookmarkRepository
import com.jetbrains.kmpapp.data.FeedRepository
import com.jetbrains.kmpapp.data.KeypApiException
import com.jetbrains.kmpapp.model.FeedItem
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface BookmarksUiState {
    data object Loading : BookmarksUiState
    data class Content(val items: List<FeedItem>) : BookmarksUiState
    data class Error(val message: String) : BookmarksUiState
}

class BookmarksViewModel(private val repository: BookmarkRepository, private val feedRepository: FeedRepository) : ViewModel() {
    private val _uiState = MutableStateFlow<BookmarksUiState>(BookmarksUiState.Loading)
    val uiState = _uiState.asStateFlow()

    init {
        viewModelScope.launch { repository.items.collect { if (_uiState.value !is BookmarksUiState.Loading) _uiState.value = BookmarksUiState.Content(it) } }
        refresh()
    }

    fun refresh() = viewModelScope.launch {
        runCatching { repository.refresh() }
            .onSuccess { _uiState.value = BookmarksUiState.Content(repository.items.value) }
            .onFailure { _uiState.value = BookmarksUiState.Error(it.toUserMessage()) }
    }

    fun remove(item: FeedItem) = viewModelScope.launch {
        runCatching { repository.remove(item) }
            .onSuccess { feedRepository.updateBookmark(item.id, false) }
            .onFailure { _uiState.value = BookmarksUiState.Error(it.toUserMessage()) }
    }
}

private fun Throwable.toUserMessage() = when (this) {
    is KeypApiException -> message ?: "북마크를 불러오지 못했어요."
    else -> "북마크를 불러오지 못했어요. 네트워크를 확인해 주세요."
}
