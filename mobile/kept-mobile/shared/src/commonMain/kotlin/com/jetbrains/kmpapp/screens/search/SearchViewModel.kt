package com.jetbrains.kmpapp.screens.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jetbrains.kmpapp.data.KeypApiException
import com.jetbrains.kmpapp.data.SubscriptionRepository
import com.jetbrains.kmpapp.data.dto.CreateSubscriptionResponse
import com.jetbrains.kmpapp.data.dto.SourcePlanDto
import com.jetbrains.kmpapp.model.Interest
import com.jetbrains.kmpapp.model.SubscriptionPlan
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface SearchUiState {
    data class Editing(val text: String = "") : SearchUiState
    data object Submitting : SearchUiState
    data class Success(val subscription: Interest, val plan: SubscriptionPlan) : SearchUiState
    data class Error(val text: String, val message: String) : SearchUiState
}

class SearchViewModel(private val repository: SubscriptionRepository) : ViewModel() {
    private val _uiState = MutableStateFlow<SearchUiState>(SearchUiState.Editing())
    val uiState = _uiState.asStateFlow()

    fun onTextChange(text: String) {
        _uiState.value = SearchUiState.Editing(text.take(2000))
    }

    fun submit() {
        val text = (_uiState.value as? SearchUiState.Editing)?.text?.trim() ?: return
        if (text.length < 2) {
            _uiState.value = SearchUiState.Error(text, "주제를 두 글자 이상 입력해 주세요.")
            return
        }
        viewModelScope.launch {
            _uiState.value = SearchUiState.Submitting
            _uiState.value = runCatching { repository.create(text) }
                .map { it.toUiState() }
                .getOrElse { SearchUiState.Error(text, it.toUserMessage()) }
        }
    }
}

private fun CreateSubscriptionResponse.toUiState(): SearchUiState.Success {
    val planSummary = SubscriptionPlan(
        topic = plan.topic,
        intervalSeconds = plan.intervalSeconds,
        sourceLabels = plan.sources.map { it.toLabel() },
    )
    return SearchUiState.Success(Interest(id, keyword, active = true), planSummary)
}

private fun SourcePlanDto.toLabel(): String = when (this) {
    is SourcePlanDto.Naver -> "네이버 · $query"
    is SourcePlanDto.X -> "X · $query"
    is SourcePlanDto.Rss -> "RSS · $url"
    is SourcePlanDto.Webhook -> "Webhook · $name"
}

private fun Throwable.toUserMessage(): String = when (this) {
    is KeypApiException -> message ?: "관심사 등록에 실패했어요. 잠시 후 다시 시도해 주세요."
    else -> "관심사 등록에 실패했어요. 잠시 후 다시 시도해 주세요."
}
