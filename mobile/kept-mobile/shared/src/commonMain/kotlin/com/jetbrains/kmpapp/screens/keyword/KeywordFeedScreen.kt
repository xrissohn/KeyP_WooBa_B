package com.jetbrains.kmpapp.screens.keyword

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jetbrains.kmpapp.ui.components.FeedItemCard
import com.jetbrains.kmpapp.ui.components.KeypLoading
import com.jetbrains.kmpapp.ui.components.KeypTopBar
import org.koin.compose.viewmodel.koinViewModel

@Composable
fun KeywordFeedScreen(subscriptionId: String, keyword: String, onBack: () -> Unit) {
    val vm = koinViewModel<KeywordFeedViewModel>()
    val state by vm.uiState.collectAsStateWithLifecycle()
    LaunchedEffect(subscriptionId) { vm.load(subscriptionId) }
    Column(Modifier.fillMaxSize()) {
        KeypTopBar(back = onBack)
        Text(keyword, Modifier.padding(horizontal = 20.dp, vertical = 12.dp), style = MaterialTheme.typography.headlineLarge)
        when (val current = state) {
            KeywordFeedUiState.Loading -> KeypLoading()
            is KeywordFeedUiState.Content -> if (current.items.isEmpty()) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("아직 수집된 소식이 없어요") }
            else LazyColumn(contentPadding = PaddingValues(horizontal = 20.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { items(current.items, key = { it.id }) { FeedItemCard(it, vm::onBookmark) } }
            is KeywordFeedUiState.Error -> Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { Text(current.message, color = MaterialTheme.colorScheme.error); TextButton(onClick = { vm.load(subscriptionId) }) { Text("다시 시도") } }
        }
    }
}
