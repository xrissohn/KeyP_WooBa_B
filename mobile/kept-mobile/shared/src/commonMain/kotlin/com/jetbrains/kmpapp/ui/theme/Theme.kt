package com.jetbrains.kmpapp.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

private val keypTypography = androidx.compose.material3.Typography(
    headlineLarge = TextStyle(fontSize = 30.sp, fontWeight = FontWeight.Bold),
    headlineMedium = TextStyle(fontSize = 26.sp, fontWeight = FontWeight.Bold),
    titleLarge = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.Bold),
    titleMedium = TextStyle(fontSize = 18.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 15.sp),
    bodyMedium = TextStyle(fontSize = 14.sp),
    labelMedium = TextStyle(fontSize = 12.sp, fontWeight = FontWeight.Medium),
)

@Composable
fun KeypTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = KeypColors.Primary,
            onPrimary = KeypColors.Canvas,
            primaryContainer = KeypColors.PrimarySoft,
            background = KeypColors.Canvas,
            surface = KeypColors.Surface,
            onBackground = KeypColors.Ink,
            onSurface = KeypColors.Ink,
            outline = KeypColors.BorderStrong,
            error = KeypColors.Error,
        ),
        typography = keypTypography,
        content = content,
    )
}
