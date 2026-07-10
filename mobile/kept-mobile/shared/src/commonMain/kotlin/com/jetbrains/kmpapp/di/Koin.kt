package com.jetbrains.kmpapp.di

import com.jetbrains.kmpapp.data.ApiConfig
import com.jetbrains.kmpapp.data.CursorStore
import com.jetbrains.kmpapp.data.DeviceRepository
import com.jetbrains.kmpapp.data.FeedRepository
import com.jetbrains.kmpapp.data.KeypApi
import com.jetbrains.kmpapp.data.KtorKeypApi
import com.jetbrains.kmpapp.data.SubscriptionRepository
import com.jetbrains.kmpapp.data.createCursorStore
import com.jetbrains.kmpapp.data.defaultApiHost
import com.jetbrains.kmpapp.screens.feed.FeedViewModel
import com.jetbrains.kmpapp.screens.home.HomeViewModel
import com.jetbrains.kmpapp.screens.mypage.MyPageViewModel
import com.jetbrains.kmpapp.screens.search.SearchViewModel
import io.ktor.client.HttpClient
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.http.URLProtocol
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import org.koin.core.context.startKoin
import org.koin.core.module.dsl.viewModelOf
import org.koin.dsl.module

val dataModule = module {
    single {
        val json = Json { ignoreUnknownKeys = true }
        HttpClient {
            expectSuccess = true
            defaultRequest {
                url { protocol = URLProtocol.HTTP; host = defaultApiHost(); port = ApiConfig.PORT }
                headers.append("x-user-id", ApiConfig.DEV_USER_ID)
            }
            install(ContentNegotiation) {
                json(json)
            }
            install(HttpTimeout) {
                requestTimeoutMillis = 15_000
            }
        }
    }

    single<KeypApi> { KtorKeypApi(get()) }
    single<CursorStore> { createCursorStore() }
    single { SubscriptionRepository(get()) }
    single { FeedRepository(get(), get()) }
    single { DeviceRepository(get()) }
}

val viewModelModule = module {
    viewModelOf(::FeedViewModel)
    viewModelOf(::HomeViewModel)
    viewModelOf(::SearchViewModel)
    viewModelOf(::MyPageViewModel)
}

fun initKoin() {
    startKoin {
        modules(
            dataModule,
            viewModelModule,
        )
    }
}
