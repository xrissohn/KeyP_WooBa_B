package com.jetbrains.kmpapp

import android.app.Application
import com.jetbrains.kmpapp.di.initKoin

open class KeypApp : Application() {
    override fun onCreate() {
        super.onCreate()
        initKoin()
    }
}

/** Keeps incremental deployments with the previous manifest from crashing. */
@Deprecated("Use KeypApp")
class MuseumApp : KeypApp()
