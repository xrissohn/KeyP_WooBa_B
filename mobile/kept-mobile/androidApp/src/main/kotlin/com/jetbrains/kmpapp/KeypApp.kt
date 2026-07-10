package com.jetbrains.kmpapp

import android.app.Application
import com.jetbrains.kmpapp.data.AndroidAppContext
import com.jetbrains.kmpapp.di.initKoin

open class KeypApp : Application() {
    override fun onCreate() {
        super.onCreate()
        AndroidAppContext.instance = this
        initKoin()
    }
}

/** Keeps incremental deployments with the previous manifest from crashing. */
@Deprecated("Use KeypApp")
class MuseumApp : KeypApp()
