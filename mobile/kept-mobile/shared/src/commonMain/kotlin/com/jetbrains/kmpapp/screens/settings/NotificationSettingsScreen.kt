package com.jetbrains.kmpapp.screens.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jetbrains.kmpapp.ui.components.KeypTopBar
import org.koin.compose.viewmodel.koinViewModel

@Composable
fun NotificationSettingsScreen(onBack: () -> Unit) {
    val vm = koinViewModel<SettingsViewModel>()
    val state by vm.uiState.collectAsStateWithLifecycle()

    Column(Modifier.fillMaxSize()) {
        KeypTopBar(back = onBack)
        Column(Modifier.padding(20.dp)) {
            Text("알림 설정", style = MaterialTheme.typography.headlineLarge)
            Card(Modifier.padding(top = 16.dp)) {
                ListItem(
                    headlineContent = { Text("푸시 알림 설정") },
                    trailingContent = { Switch(state.pushEnabled, vm::togglePush) },
                )
            }
        }
    }
}
