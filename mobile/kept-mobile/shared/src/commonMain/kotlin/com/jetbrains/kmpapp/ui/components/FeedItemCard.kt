package com.jetbrains.kmpapp.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import com.jetbrains.kmpapp.model.FeedItem
import com.jetbrains.kmpapp.ui.theme.KeypColors

@Composable
fun FeedItemCard(item: FeedItem, onBookmark: (String) -> Unit) {
    val uriHandler = LocalUriHandler.current
    Card(border = BorderStroke(1.dp, KeypColors.Border), shape = RoundedCornerShape(16.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
        Column(Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(item.provider.substringAfter(':').replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.labelMedium, color = KeypColors.Primary)
                Text(item.createdAt.take(16).replace('T', ' '), style = MaterialTheme.typography.labelMedium, color = KeypColors.InkSoft)
            }
            Spacer(Modifier.height(8.dp))
            Text(item.title, style = MaterialTheme.typography.titleMedium)
            item.summary?.let { Text(it, Modifier.padding(top = 6.dp), color = KeypColors.InkSecondary) }
            HorizontalDivider(Modifier.padding(vertical = 12.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton(onClick = { uriHandler.openUri(item.url) }) { Text("원문 보기") }
                IconButton(onClick = { onBookmark(item.id) }) { Icon(if (item.bookmarked) Icons.Default.Bookmark else Icons.Default.BookmarkBorder, "북마크") }
            }
        }
    }
}
