package com.jetbrains.kmpapp.data

/** Persists the last processed event cursor so app restarts don't re-fetch the whole feed. */
interface CursorStore {
    fun get(): Long?
    fun set(cursor: Long)
}

expect fun createCursorStore(): CursorStore
