package com.jetbrains.kmpapp.screens.mypage

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jetbrains.kmpapp.data.DeviceRepository
import com.jetbrains.kmpapp.data.PushTokenProvider
import com.jetbrains.kmpapp.data.SubscriptionRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class MyPageUiState(val subscriptionCount: Int = 0, val pushEnabled: Boolean = true)

class MyPageViewModel(
    private val subscriptions: SubscriptionRepository,
    private val devices: DeviceRepository,
    private val pushTokenProvider: PushTokenProvider,
) : ViewModel() {
    private val _uiState = MutableStateFlow(MyPageUiState())
    val uiState = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            runCatching { subscriptions.refresh() }
            subscriptions.interests.collect { _uiState.value = _uiState.value.copy(subscriptionCount = it.size) }
        }
    }

    fun togglePush(enabled: Boolean) {
        viewModelScope.launch {
            val token = pushTokenProvider.currentToken()
            runCatching { devices.setEnabled(enabled, token, pushTokenProvider.platform) }
            _uiState.value = _uiState.value.copy(pushEnabled = enabled)
        }
    }
}
