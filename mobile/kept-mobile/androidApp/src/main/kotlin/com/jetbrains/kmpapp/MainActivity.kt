package com.jetbrains.kmpapp

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.jetbrains.kmpapp.data.DeviceRepository
import com.jetbrains.kmpapp.data.PushTokenProvider
import kotlinx.coroutines.launch
import org.koin.core.context.GlobalContext

private const val TAG = "KeypPush"

class MainActivity : ComponentActivity() {
    private val requestNotificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        requestNotificationPermissionIfNeeded()
        registerPushToken()
        setContent {
            App()
        }
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val granted = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        if (!granted) requestNotificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    /** Registers the current FCM token with the backend; token issuance doesn't require notification permission. */
    private fun registerPushToken() {
        val koin = GlobalContext.get()
        val devices = koin.get<DeviceRepository>()
        val tokenProvider = koin.get<PushTokenProvider>()
        lifecycleScope.launch {
            val token = tokenProvider.currentToken()
            Log.d(TAG, "fetched FCM token: ${token?.take(16)}...")
            runCatching { devices.setEnabled(true, token, tokenProvider.platform) }
                .onSuccess { Log.d(TAG, "registered device with backend") }
                .onFailure { Log.e(TAG, "failed to register device", it) }
        }
    }
}
