package com.jetbrains.kmpapp.data

import com.jetbrains.kmpapp.data.dto.*
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.plugins.ResponseException
import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType

interface KeypApi {
    suspend fun registerInstallation(token: String?, platform: String)
    suspend fun listSubscriptions(): List<SubscriptionDto>
    suspend fun createSubscription(keyword: String): CreateSubscriptionResponse
    suspend fun updateSubscriptionStatus(id: String, active: Boolean)
    suspend fun deleteSubscription(id: String)
    suspend fun listEvents(cursor: Long?, limit: Int = 50): EventsPageDto
    suspend fun registerDevice(token: String, platform: String)
    suspend fun deleteDevice(token: String)
}

class KtorKeypApi(
    private val client: HttpClient,
    private val pushTokenProvider: PushTokenProvider,
) : KeypApi {
    private suspend fun installationId(): String =
        requireNotNull(pushTokenProvider.installationId()) { "Firebase installation ID is unavailable" }

    private suspend fun <T> mapErrors(block: suspend () -> T): T =
        try {
            block()
        } catch (e: ResponseException) {
            throw e.toKeypApiException()
        }

    override suspend fun listSubscriptions() = mapErrors {
        client.get("v1/subscriptions") {
            headers.append("x-firebase-installation-id", installationId())
        }.body<SubscriptionsResponse>().subscriptions
    }

    override suspend fun registerInstallation(token: String?, platform: String) {
        mapErrors {
            client.put("v1/installations/current") {
                headers.append("x-firebase-installation-id", installationId())
                contentType(ContentType.Application.Json)
                setBody(RegisterInstallationRequest(platform, token))
            }
        }
    }

    override suspend fun createSubscription(keyword: String) = mapErrors {
        client.post("v1/subscriptions") {
            headers.append("x-firebase-installation-id", installationId())
            contentType(ContentType.Application.Json)
            setBody(CreateSubscriptionRequest(keyword))
        }.body<CreateSubscriptionResponse>()
    }

    override suspend fun updateSubscriptionStatus(id: String, active: Boolean) {
        mapErrors {
            client.patch("v1/subscriptions/$id/status") {
                headers.append("x-firebase-installation-id", installationId())
                contentType(ContentType.Application.Json)
                setBody(UpdateSubscriptionStatusRequest(active))
            }
        }
    }

    override suspend fun deleteSubscription(id: String) {
        mapErrors {
            client.delete("v1/subscriptions/$id") {
                headers.append("x-firebase-installation-id", installationId())
            }
        }
    }

    override suspend fun listEvents(cursor: Long?, limit: Int) = mapErrors {
        client.get("v1/events") {
            headers.append("x-firebase-installation-id", installationId())
            url.parameters.append("cursor", (cursor ?: 0L).toString())
            url.parameters.append("limit", limit.toString())
        }.body<EventsPageDto>()
    }

    override suspend fun registerDevice(token: String, platform: String) {
        mapErrors {
            client.post("v1/devices") {
                headers.append("x-firebase-installation-id", installationId())
                contentType(ContentType.Application.Json)
                setBody(RegisterDeviceRequest(token, platform))
            }
        }
    }

    override suspend fun deleteDevice(token: String) {
        mapErrors {
            client.delete("v1/devices") {
                headers.append("x-firebase-installation-id", installationId())
                contentType(ContentType.Application.Json)
                setBody(DeleteDeviceRequest(token))
            }
        }
    }
}
