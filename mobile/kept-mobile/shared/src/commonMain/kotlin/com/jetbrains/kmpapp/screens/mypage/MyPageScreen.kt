package com.jetbrains.kmpapp.screens.mypage

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jetbrains.kmpapp.ui.components.KeypTopBar
import org.koin.compose.viewmodel.koinViewModel

@Composable fun MyPageScreen(onManageInterests: () -> Unit) { val vm = koinViewModel<MyPageViewModel>(); val state by vm.uiState.collectAsStateWithLifecycle(); Column(Modifier.fillMaxSize()) { KeypTopBar(); Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) { Text("마이페이지", style = MaterialTheme.typography.headlineLarge); Card { ListItem(headlineContent = { Text("KeyP 사용자") }, supportingContent = { Text("구독 중인 관심사 ${state.subscriptionCount}개") }) }; Text("알림", style = MaterialTheme.typography.titleMedium); Card { ListItem(headlineContent = { Text("푸시 알림") }, supportingContent = { Text("새 소식 알림 받기") }, trailingContent = { Switch(state.pushEnabled, vm::togglePush) }) }; Text("콘텐츠", style = MaterialTheme.typography.titleMedium); Card { ListItem(headlineContent = { Text("관심사 관리") }, modifier = Modifier.fillMaxWidth(), trailingContent = { TextButton(onClick = onManageInterests) { Text("이동") } }) }; Text("앱 정보", style = MaterialTheme.typography.titleMedium); Card { ListItem(headlineContent = { Text("버전") }, trailingContent = { Text("1.0.0") }) } } } }
