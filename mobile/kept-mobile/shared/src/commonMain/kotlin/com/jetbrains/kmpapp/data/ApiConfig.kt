package com.jetbrains.kmpapp.data

/** Backend connection settings shared by all platforms. See docs/API.md. */
object ApiConfig {
    const val PORT = 3000
}

/**
 * Default backend host per platform:
 * - Android emulator: `10.0.2.2` (host loopback alias)
 * - iOS simulator: `localhost`
 * - Real devices: override with the dev machine's LAN IP.
 */
expect fun defaultApiHost(): String
