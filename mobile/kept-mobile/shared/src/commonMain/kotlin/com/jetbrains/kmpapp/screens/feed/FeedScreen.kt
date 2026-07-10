package com.jetbrains.kmpapp.screens.feed

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.jetbrains.kmpapp.ui.components.KeypTopBar
import com.jetbrains.kmpapp.ui.theme.KeypColors
import org.koin.compose.viewmodel.koinViewModel

@Composable fun FeedScreen() { val vm = koinViewModel<FeedViewModel>(); val state by vm.uiState.collectAsStateWithLifecycle(); Column(Modifier.fillMaxSize()) { KeypTopBar(); Row(Modifier.fillMaxWidth().padding(20.dp), horizontalArrangement = Arrangement.SpaceBetween) { Text("속보 피드", style = MaterialTheme.typography.headlineLarge); TextButton(onClick = vm::refresh) { Text("새로고침") } }; when (val current = state) { FeedUiState.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) { CircularProgressIndicator() }; is FeedUiState.Content -> if (current.items.isEmpty()) Box(Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) { Text("새 소식이 없어요") } else LazyColumn(contentPadding = PaddingValues(horizontal = 20.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) { items(current.items, key = { it.id }) { item -> Card(border = BorderStroke(1.dp, KeypColors.Border), shape = RoundedCornerShape(16.dp)) { Column(Modifier.padding(16.dp)) { Text(item.provider.substringAfter(':').replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.labelMedium, color = KeypColors.Primary); Spacer(Modifier.height(8.dp)); Text(item.title, style = MaterialTheme.typography.titleMedium); item.summary?.let { Text(it, Modifier.padding(top = 6.dp), color = KeypColors.InkSecondary) }; HorizontalDivider(Modifier.padding(vertical = 12.dp)); Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(item.createdAt, style = MaterialTheme.typography.labelMedium, color = KeypColors.InkSoft); IconButton(onClick = { vm.onBookmark(item.id) }) { Icon(if (item.bookmarked) Icons.Default.Bookmark else Icons.Default.BookmarkBorder, "북마크") } } } } } }; is FeedUiState.Error -> Column(Modifier.fillMaxSize(), horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { Text(current.message, color = MaterialTheme.colorScheme.error); TextButton(onClick = vm::refresh) { Text("다시 시도") } } } } }
