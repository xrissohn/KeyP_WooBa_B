package com.jetbrains.kmpapp.model

data class SubscriptionPlan(
    val topic: String,
    val intervalSeconds: Int,
    val sourceLabels: List<String>,
)
