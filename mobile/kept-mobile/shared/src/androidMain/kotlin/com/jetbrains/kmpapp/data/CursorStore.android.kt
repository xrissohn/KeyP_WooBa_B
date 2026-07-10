package com.jetbrains.kmpapp.data

import android.content.Context

private const val PREFS_NAME = "keyp_feed"
private const val KEY_CURSOR = "cursor"

actual fun createCursorStore(): CursorStore = object : CursorStore {
    private val prefs = AndroidAppContext.instance.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    override fun get(): Long? = prefs.getLong(KEY_CURSOR, -1L).takeIf { it >= 0 }
    override fun set(cursor: Long) {
        prefs.edit().putLong(KEY_CURSOR, cursor).apply()
    }
}
