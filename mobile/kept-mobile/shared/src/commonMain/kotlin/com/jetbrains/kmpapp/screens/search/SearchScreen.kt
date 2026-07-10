package com.jetbrains.kmpapp.screens.search

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jetbrains.kmpapp.ui.components.KeypTopBar
import com.jetbrains.kmpapp.ui.components.PrimaryButton
import com.jetbrains.kmpapp.ui.theme.KeypColors
import org.koin.compose.viewmodel.koinViewModel

@Composable fun SearchScreen(onBack: () -> Unit, onDone: () -> Unit) { val vm = koinViewModel<SearchViewModel>(); val state by vm.uiState.collectAsStateWithLifecycle(); val text = when (val current = state) { is SearchUiState.Editing -> current.text; is SearchUiState.Error -> current.text; else -> "" }; Column(Modifier.fillMaxSize()) { KeypTopBar(onBack); Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) { Text("무엇이든 편하게 검색하세요", style = MaterialTheme.typography.headlineMedium); Text("관심 있는 주제를 입력하면 AI가 검색 계획을 만들고 새 소식을 알려드려요.", color = KeypColors.InkSecondary); Text("주제", style = MaterialTheme.typography.titleMedium); OutlinedTextField(value = text, onValueChange = vm::onTextChange, modifier = Modifier.fillMaxWidth().height(180.dp), placeholder = { Text("예: 서울 Java Spring 백엔드 개발자 채용") }, supportingText = { Text("${text.length}/2000") }, isError = state is SearchUiState.Error); (state as? SearchUiState.Error)?.let { Text(it.message, color = MaterialTheme.colorScheme.error) }; Spacer(Modifier.weight(1f)); PrimaryButton("AI 분석 실행", enabled = text.length >= 2, onClick = { vm.submitMock(); onDone() }) } } }
