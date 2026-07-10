package com.jetbrains.kmpapp.data

import com.google.firebase.messaging.FirebaseMessaging
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

actual fun createPushTokenProvider(): PushTokenProvider = object : PushTokenProvider {
    override val platform = "android"

    override suspend fun currentToken(): String? = suspendCancellableCoroutine { continuation ->
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            continuation.resume(if (task.isSuccessful) task.result else null)
        }
    }
}
