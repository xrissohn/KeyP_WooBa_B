package com.jetbrains.kmpapp.model

data class FeedItem(
    val id: String,
    val subscriptionId: String,
    val provider: String,
    val title: String,
    val summary: String?,
    val url: String,
    val createdAt: String,
    val bookmarked: Boolean = false,
)
