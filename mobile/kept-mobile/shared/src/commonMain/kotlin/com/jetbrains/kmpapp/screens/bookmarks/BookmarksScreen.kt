package com.jetbrains.kmpapp.screens.bookmarks

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
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
fun BookmarksScreen() {
    val vm = koinViewModel<BookmarksViewModel>()
    val state by vm.uiState.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize()) {
        KeypTopBar()
        androidx.compose.foundation.layout.Row(Modifier.fillMaxWidth().padding(20.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("북마크", style = MaterialTheme.typography.headlineLarge)
            TextButton(onClick = vm::refresh) { Text("새로고침") }
        }
        when (val current = state) {
            BookmarksUiState.Loading -> KeypLoading()
            is BookmarksUiState.Content -> if (current.items.isEmpty()) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("북마크한 소식이 없어요") }
            else LazyColumn(contentPadding = PaddingValues(horizontal = 20.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(current.items, key = { it.id }) { item -> FeedItemCard(item) { vm.remove(item) } }
            }
            is BookmarksUiState.Error -> Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Text(current.message, color = MaterialTheme.colorScheme.error)
                TextButton(onClick = vm::refresh) { Text("다시 시도") }
            }
        }
    }
}
