package com.jetbrains.kmpapp.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Article
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.jetbrains.kmpapp.ui.theme.KeypColors

@Composable fun KeypTopBar(back: (() -> Unit)? = null, onSettings: (() -> Unit)? = null) = Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) { if (back != null) IconButton(onClick = back) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "뒤로가기") }; Text("KeyP", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = KeypColors.Primary); Spacer(Modifier.weight(1f)); onSettings?.let { IconButton(onClick = it) { Icon(Icons.Default.Settings, "설정") } } }

@Composable fun KeypBottomBar(selected: String, onSelect: (String) -> Unit) = Row(Modifier.fillMaxWidth().background(Color.White).navigationBarsPadding().padding(vertical = 8.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
    listOf("feed" to "피드", "home" to "홈 화면", "mypage" to "마이페이지").forEach { (key, label) ->
        val icon = when (key) { "feed" -> Icons.AutoMirrored.Filled.Article; "home" -> Icons.Default.Home; else -> Icons.Default.Person }
        Column(
            modifier = Modifier.weight(1f).clickable { onSelect(key) }.padding(horizontal = 16.dp, vertical = 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(icon, label, tint = if (selected == key) KeypColors.Primary else KeypColors.InkSoft)
            Text(label, color = if (selected == key) KeypColors.Primary else KeypColors.InkSoft)
        }
    }
}

@Composable fun PrimaryButton(text: String, enabled: Boolean = true, onClick: () -> Unit) = Button(onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(12.dp), colors = ButtonDefaults.buttonColors(containerColor = KeypColors.Primary)) { Text(text) }
