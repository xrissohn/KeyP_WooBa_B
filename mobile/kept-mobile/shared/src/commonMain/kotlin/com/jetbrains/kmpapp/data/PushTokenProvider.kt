package com.jetbrains.kmpapp.data

/** Reads this device's current push notification token for registration with the backend. */
interface PushTokenProvider {
    val platform: String
    suspend fun installationId(): String?
    suspend fun currentToken(): String?
}

expect fun createPushTokenProvider(): PushTokenProvider
