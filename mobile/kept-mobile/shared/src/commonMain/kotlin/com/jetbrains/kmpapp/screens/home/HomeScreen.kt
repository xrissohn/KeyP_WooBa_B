package com.jetbrains.kmpapp.screens.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jetbrains.kmpapp.ui.components.PrimaryButton
import com.jetbrains.kmpapp.ui.components.KeypTopBar
import org.koin.compose.viewmodel.koinViewModel

@Composable fun HomeScreen(onAddInterest: () -> Unit) { val vm = koinViewModel<HomeViewModel>(); val state by vm.uiState.collectAsStateWithLifecycle(); var pendingDelete by remember { mutableStateOf<String?>(null) }; Column(Modifier.fillMaxSize()) { KeypTopBar(); Row(Modifier.fillMaxWidth().padding(20.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) { Text("내 관심사", style = MaterialTheme.typography.headlineLarge); IconButton(onClick = onAddInterest) { Icon(Icons.Default.Add, "관심사 추가") } }; state.error?.let { Text(it, Modifier.padding(horizontal = 20.dp), color = MaterialTheme.colorScheme.error) }; if (state.interests.isEmpty() && !state.isLoading) Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) { Text("등록한 관심사가 없어요") } else LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { items(state.interests, key = { it.id }) { item -> ListItem(headlineContent = { Text(item.keyword) }, supportingContent = { Text(if (item.active) "실시간 알림" else "알림 일시정지") }, trailingContent = { Row { IconButton(onClick = { vm.toggleNotification(item.id) }) { Icon(if (item.active) Icons.Default.Notifications else Icons.Default.NotificationsOff, "알림 상태") }; IconButton(onClick = { pendingDelete = item.id }) { Icon(Icons.Default.Delete, "삭제") } } }) } }; PrimaryButton("관심사 추가", ModifierPadding(), onAddInterest) }; pendingDelete?.let { id -> AlertDialog(onDismissRequest = { pendingDelete = null }, title = { Text("관심사를 삭제할까요?") }, confirmButton = { TextButton(onClick = { vm.delete(id); pendingDelete = null }) { Text("삭제") } }, dismissButton = { TextButton(onClick = { pendingDelete = null }) { Text("취소") } }) } }
@Composable private fun PrimaryButton(text: String, padding: Modifier, onClick: () -> Unit) { Box(Modifier.padding(20.dp)) { com.jetbrains.kmpapp.ui.components.PrimaryButton(text, onClick = onClick) } }
private fun ModifierPadding() = Modifier
