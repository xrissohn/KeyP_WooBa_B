package com.jetbrains.kmpapp.screens.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jetbrains.kmpapp.data.DeviceRepository
import com.jetbrains.kmpapp.data.PushTokenProvider
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class SettingsUiState(val pushEnabled: Boolean = true)

class SettingsViewModel(
    private val devices: DeviceRepository,
    private val pushTokenProvider: PushTokenProvider,
) : ViewModel() {
    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState = _uiState.asStateFlow()

    fun togglePush(enabled: Boolean) {
        viewModelScope.launch {
            val token = pushTokenProvider.currentToken()
            runCatching { devices.setEnabled(enabled, token, pushTokenProvider.platform) }
            _uiState.value = _uiState.value.copy(pushEnabled = enabled)
        }
    }
}
