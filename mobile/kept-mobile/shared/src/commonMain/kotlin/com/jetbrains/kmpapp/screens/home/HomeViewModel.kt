package com.jetbrains.kmpapp.screens.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jetbrains.kmpapp.data.KeypApiException
import com.jetbrains.kmpapp.data.SubscriptionRepository
import com.jetbrains.kmpapp.model.Interest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class HomeUiState(val interests: List<Interest> = emptyList(), val isLoading: Boolean = true, val error: String? = null)

class HomeViewModel(private val repository: SubscriptionRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState = _uiState.asStateFlow()

    init {
        viewModelScope.launch { repository.interests.collect { interests -> _uiState.update { it.copy(interests = interests, isLoading = false) } } }
        refresh()
    }

    fun refresh() = viewModelScope.launch {
        _uiState.update { it.copy(error = null) }
        runCatching { repository.refresh() }
            .onFailure { _uiState.update { state -> state.copy(isLoading = false, error = it.toUserMessage()) } }
    }

    fun toggleNotification(id: String) = viewModelScope.launch {
        runCatching { repository.toggle(id) }.onFailure { it.resyncOnNotFound() }
    }

    fun delete(id: String) = viewModelScope.launch {
        runCatching { repository.delete(id) }.onFailure { it.resyncOnNotFound() }
    }

    private suspend fun Throwable.resyncOnNotFound() {
        if (this is KeypApiException.NotFound) {
            runCatching { repository.refresh() }
        } else {
            _uiState.update { it.copy(error = toUserMessage()) }
        }
    }
}

private fun Throwable.toUserMessage(): String = when (this) {
    is KeypApiException -> message ?: "요청을 처리하지 못했어요. 다시 시도해 주세요."
    else -> "요청을 처리하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요."
}
