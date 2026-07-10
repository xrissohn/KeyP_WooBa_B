package com.jetbrains.kmpapp.screens.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jetbrains.kmpapp.ui.components.KeypLoading
import com.jetbrains.kmpapp.ui.components.KeypTopBar
import com.jetbrains.kmpapp.ui.components.PrimaryButton
import com.jetbrains.kmpapp.ui.theme.KeypColors
import org.koin.compose.viewmodel.koinViewModel

@Composable
fun HomeScreen(onAddInterest: () -> Unit, onOpenSettings: () -> Unit, onOpenKeywordFeed: (String, String) -> Unit) {
    val vm = koinViewModel<HomeViewModel>()
    val state by vm.uiState.collectAsStateWithLifecycle()
    var pendingDelete by remember { mutableStateOf<String?>(null) }
    Column(Modifier.fillMaxSize()) {
        KeypTopBar(onSettings = onOpenSettings)
        Text("내 관심사", Modifier.padding(20.dp), style = MaterialTheme.typography.headlineLarge)
        state.error?.let { Text(it, Modifier.padding(horizontal = 20.dp), color = MaterialTheme.colorScheme.error) }
        when {
            state.isLoading && state.interests.isEmpty() -> KeypLoading()
            state.interests.isEmpty() -> Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) { Text("등록한 관심사가 없어요") }
            else -> LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(state.interests, key = { it.id }) { item ->
                    ListItem(
                        modifier = Modifier.alpha(if (item.active) 1f else 0.45f).clickable { onOpenKeywordFeed(item.id, item.keyword) },
                        headlineContent = { Text(item.keyword) },
                        supportingContent = {
                            if (item.active) Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.size(8.dp).clip(CircleShape).background(KeypColors.Success))
                                Spacer(Modifier.width(4.dp))
                                Text("실시간 알림")
                            } else Text("알림 일시정지")
                        },
                        trailingContent = {
                            Row {
                                IconButton(onClick = { vm.toggleNotification(item.id) }) { Icon(if (item.active) Icons.Default.Notifications else Icons.Default.NotificationsOff, "알림 상태") }
                                IconButton(onClick = { pendingDelete = item.id }) { Icon(Icons.Default.Delete, "삭제") }
                            }
                        },
                    )
                }
            }
        }
        Box(Modifier.padding(20.dp)) { PrimaryButton("관심사 추가", onClick = onAddInterest) }
    }
    pendingDelete?.let { id ->
        AlertDialog(onDismissRequest = { pendingDelete = null }, title = { Text("관심사를 삭제할까요?") }, confirmButton = { TextButton(onClick = { vm.delete(id); pendingDelete = null }) { Text("삭제") } }, dismissButton = { TextButton(onClick = { pendingDelete = null }) { Text("취소") } })
    }
}
