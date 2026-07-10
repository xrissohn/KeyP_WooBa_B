package com.jetbrains.kmpapp.data

import platform.Foundation.NSUserDefaults

private const val KEY_CURSOR = "keyp_feed_cursor"

actual fun createCursorStore(): CursorStore = object : CursorStore {
    private val defaults = NSUserDefaults.standardUserDefaults
    override fun get(): Long? = if (defaults.objectForKey(KEY_CURSOR) != null) defaults.integerForKey(KEY_CURSOR) else null
    override fun set(cursor: Long) {
        defaults.setInteger(cursor, forKey = KEY_CURSOR)
    }
}
