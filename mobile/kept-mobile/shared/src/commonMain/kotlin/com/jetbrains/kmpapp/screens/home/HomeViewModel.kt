package com.jetbrains.kmpapp.screens.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jetbrains.kmpapp.data.SubscriptionRepository
import com.jetbrains.kmpapp.model.Interest
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class HomeUiState(val interests: List<Interest> = emptyList(), val isLoading: Boolean = true, val error: String? = null)
class HomeViewModel(private val repository: SubscriptionRepository) : ViewModel() {
    val uiState: StateFlow<HomeUiState> = repository.interests.map { HomeUiState(it, false) }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), HomeUiState())
    init { refresh() }
    fun refresh() = viewModelScope.launch { runCatching { repository.refresh() } }
    fun toggleNotification(id: String) = viewModelScope.launch { runCatching { repository.toggle(id) } }
    fun delete(id: String) = viewModelScope.launch { runCatching { repository.delete(id) } }
}
