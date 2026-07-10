package com.jetbrains.kmpapp.screens.keyword

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jetbrains.kmpapp.data.BookmarkRepository
import com.jetbrains.kmpapp.data.KeypApi
import com.jetbrains.kmpapp.data.FeedRepository
import com.jetbrains.kmpapp.data.KeypApiException
import com.jetbrains.kmpapp.data.toFeedItem
import com.jetbrains.kmpapp.model.FeedItem
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface KeywordFeedUiState {
    data object Loading : KeywordFeedUiState
    data class Content(val items: List<FeedItem>) : KeywordFeedUiState
    data class Error(val message: String) : KeywordFeedUiState
}

class KeywordFeedViewModel(private val api: KeypApi, private val bookmarks: BookmarkRepository, private val feedRepository: FeedRepository) : ViewModel() {
    private val _uiState = MutableStateFlow<KeywordFeedUiState>(KeywordFeedUiState.Loading)
    val uiState = _uiState.asStateFlow()

    fun load(subscriptionId: String) = viewModelScope.launch {
        _uiState.value = KeywordFeedUiState.Loading
        runCatching {
            var cursor: Long? = null
            var hasMore = true
            val items = mutableListOf<FeedItem>()
            while (hasMore) {
                val page = api.listSubscriptionEvents(subscriptionId, cursor)
                items += page.events.map { it.toFeedItem() }
                cursor = page.nextCursor
                hasMore = page.hasMore
            }
            items.distinctBy { it.id }.sortedByDescending { it.id.toLongOrNull() ?: 0L }
        }.onSuccess { _uiState.value = KeywordFeedUiState.Content(it) }
            .onFailure { _uiState.value = KeywordFeedUiState.Error(it.toUserMessage()) }
    }

    fun onBookmark(id: String) = viewModelScope.launch {
        val current = (_uiState.value as? KeywordFeedUiState.Content)?.items?.firstOrNull { it.id == id } ?: return@launch
        val updated = current.copy(bookmarked = !current.bookmarked)
        _uiState.value = KeywordFeedUiState.Content((_uiState.value as KeywordFeedUiState.Content).items.map { if (it.id == id) updated else it })
        runCatching { api.updateBookmark(id.toLong(), updated.bookmarked) }
            .onSuccess { bookmarks.sync(updated); feedRepository.updateBookmark(id, updated.bookmarked) }
            .onFailure {
                _uiState.value = KeywordFeedUiState.Content((_uiState.value as KeywordFeedUiState.Content).items.map { if (it.id == id) current else it })
            }
    }
}

private fun Throwable.toUserMessage() = when (this) {
    is KeypApiException -> message ?: "소식을 불러오지 못했어요."
    else -> "소식을 불러오지 못했어요. 네트워크를 확인해 주세요."
}
