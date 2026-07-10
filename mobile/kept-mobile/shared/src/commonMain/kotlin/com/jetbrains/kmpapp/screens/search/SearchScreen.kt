package com.jetbrains.kmpapp.screens.search

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jetbrains.kmpapp.ui.components.KeypTopBar
import com.jetbrains.kmpapp.ui.components.PrimaryButton
import com.jetbrains.kmpapp.ui.theme.KeypColors
import org.koin.compose.viewmodel.koinViewModel

@Composable
fun SearchScreen(onBack: () -> Unit, onDone: () -> Unit) {
    val vm = koinViewModel<SearchViewModel>()
    val state by vm.uiState.collectAsStateWithLifecycle()

    when (val current = state) {
        is SearchUiState.Success -> SearchSuccessContent(current, onBack, onDone)
        else -> SearchEditingContent(state, vm, onBack)
    }
}

@Composable
private fun SearchEditingContent(state: SearchUiState, vm: SearchViewModel, onBack: () -> Unit) {
    val text = when (state) {
        is SearchUiState.Editing -> state.text
        is SearchUiState.Error -> state.text
        else -> ""
    }
    Column(Modifier.fillMaxSize()) {
        KeypTopBar(onBack)
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("무엇이든 편하게 검색하세요", style = MaterialTheme.typography.headlineMedium)
            Text("관심 있는 주제를 입력하면 AI가 검색 계획을 만들고 새 소식을 알려드려요.", color = KeypColors.InkSecondary)
            Text("주제", style = MaterialTheme.typography.titleMedium)
            OutlinedTextField(
                value = text,
                onValueChange = vm::onTextChange,
                modifier = Modifier.fillMaxWidth().height(180.dp),
                placeholder = { Text("예: 서울 Java Spring 백엔드 개발자 채용") },
                supportingText = { Text("${text.length}/200") },
                isError = state is SearchUiState.Error,
                enabled = state !is SearchUiState.Submitting,
            )
            (state as? SearchUiState.Error)?.let { Text(it.message, color = MaterialTheme.colorScheme.error) }
            Spacer(Modifier.weight(1f))
            PrimaryButton(
                if (state is SearchUiState.Submitting) "분석 중..." else "AI 분석 실행",
                enabled = text.length >= 2 && state !is SearchUiState.Submitting,
                onClick = vm::submit,
            )
        }
    }
}

@Composable
private fun SearchSuccessContent(state: SearchUiState.Success, onBack: () -> Unit, onDone: () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        KeypTopBar(onBack)
        Column(Modifier.padding(20.dp).weight(1f), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text("검색 계획이 만들어졌어요", style = MaterialTheme.typography.headlineMedium)
            Text(state.subscription.keyword, style = MaterialTheme.typography.titleMedium, color = KeypColors.Primary)
            Text("${state.plan.intervalSeconds / 60}분마다 다음 소스를 확인해요", color = KeypColors.InkSecondary)
            state.plan.sourceLabels.forEach { label ->
                Text("· $label", style = MaterialTheme.typography.bodyMedium)
            }
        }
        Box(Modifier.padding(20.dp)) {
            PrimaryButton("확인", onClick = onDone)
        }
    }
}
