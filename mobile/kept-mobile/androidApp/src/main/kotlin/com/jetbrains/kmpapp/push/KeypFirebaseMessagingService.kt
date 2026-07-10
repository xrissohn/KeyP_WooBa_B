package com.jetbrains.kmpapp.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.jetbrains.kmpapp.MainActivity
import com.jetbrains.kmpapp.R
import com.jetbrains.kmpapp.data.DeviceRepository
import com.jetbrains.kmpapp.data.PushTokenProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.koin.core.context.GlobalContext

const val PUSH_CHANNEL_ID = "keyp_default"
private const val PUSH_CHANNEL_NAME = "KeyP 알림"

/** Creates the notification channel used for FCM notifications; must exist before any message arrives. */
fun ensureNotificationChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(PUSH_CHANNEL_ID) != null) return
    manager.createNotificationChannel(
        NotificationChannel(PUSH_CHANNEL_ID, PUSH_CHANNEL_NAME, NotificationManager.IMPORTANCE_DEFAULT)
    )
}

class KeypFirebaseMessagingService : FirebaseMessagingService() {
    private val scope = CoroutineScope(Dispatchers.Default)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        val koin = GlobalContext.get()
        val devices = koin.get<DeviceRepository>()
        val tokenProvider = koin.get<PushTokenProvider>()
        scope.launch {
            runCatching { devices.setEnabled(true, token, tokenProvider.platform) }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        val title = message.notification?.title ?: message.data["title"] ?: getString(R.string.app_name)
        val body = message.notification?.body ?: message.data["body"] ?: return
        showNotification(title, body, message.data["url"])
    }

    private fun showNotification(title: String, body: String, url: String?) {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            url?.let { putExtra("push_url", it) }
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(this, PUSH_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(System.currentTimeMillis().toInt(), notification)
    }
}
