package com.jetbrains.kmpapp.di

import com.jetbrains.kmpapp.data.DeviceRepository
import com.jetbrains.kmpapp.data.FeedRepository
import com.jetbrains.kmpapp.data.KeypApi
import com.jetbrains.kmpapp.data.KtorKeypApi
import com.jetbrains.kmpapp.data.SubscriptionRepository
import com.jetbrains.kmpapp.screens.feed.FeedViewModel
import com.jetbrains.kmpapp.screens.home.HomeViewModel
import com.jetbrains.kmpapp.screens.mypage.MyPageViewModel
import com.jetbrains.kmpapp.screens.search.SearchViewModel
import io.ktor.client.HttpClient
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
            defaultRequest {
                url { protocol = URLProtocol.HTTP; host = "10.0.2.2"; port = 3000 }
                headers.append("x-user-id", "keyp-mobile-dev")
            }
            install(ContentNegotiation) {
                json(json)
            }
        }
    }

    single<KeypApi> { KtorKeypApi(get()) }
    single { SubscriptionRepository(get()) }
    single { FeedRepository(get()) }
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
