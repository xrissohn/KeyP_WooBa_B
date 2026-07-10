package com.jetbrains.kmpapp.data

import android.content.Context

/** Set once from the Application's onCreate, before initKoin(). */
object AndroidAppContext {
    lateinit var instance: Context
}
