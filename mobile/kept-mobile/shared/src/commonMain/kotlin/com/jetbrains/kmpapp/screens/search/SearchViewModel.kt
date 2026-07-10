package com.jetbrains.kmpapp.screens.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.jetbrains.kmpapp.data.SubscriptionRepository
import com.jetbrains.kmpapp.model.Interest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface SearchUiState { data class Editing(val text: String = "") : SearchUiState; data object Submitting : SearchUiState; data class Success(val subscription: Interest) : SearchUiState; data class Error(val text: String, val message: String) : SearchUiState }
class SearchViewModel(private val repository: SubscriptionRepository) : ViewModel() {
    private val _uiState = MutableStateFlow<SearchUiState>(SearchUiState.Editing()); val uiState = _uiState.asStateFlow()
    fun onTextChange(text: String) { _uiState.value = SearchUiState.Editing(text.take(2000)) }
    fun submitMock() {
        val text = (_uiState.value as? SearchUiState.Editing)?.text?.trim() ?: return
        if (text.length >= 2) repository.createMock(text)
    }
    fun submit() { val text = (_uiState.value as? SearchUiState.Editing)?.text?.trim() ?: return; if (text.length < 2) { _uiState.value = SearchUiState.Error(text, "주제를 두 글자 이상 입력해 주세요."); return }; viewModelScope.launch { _uiState.value = SearchUiState.Submitting; _uiState.value = runCatching { SearchUiState.Success(repository.create(text)) }.getOrElse { SearchUiState.Error(text, "관심사 등록에 실패했어요. 잠시 후 다시 시도해 주세요.") } } }
}
