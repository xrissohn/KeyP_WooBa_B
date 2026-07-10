package com.jetbrains.kmpapp.data

/** iOS push notifications (APNs) are not wired up yet. */
actual fun createPushTokenProvider(): PushTokenProvider = object : PushTokenProvider {
    override val platform = "ios"
    override suspend fun installationId(): String? = null
    override suspend fun currentToken(): String? = null
}
