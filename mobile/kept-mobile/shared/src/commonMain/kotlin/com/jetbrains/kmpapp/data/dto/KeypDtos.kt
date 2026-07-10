package com.jetbrains.kmpapp.data.dto

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonClassDiscriminator

@Serializable data class SubscriptionsResponse(val subscriptions: List<SubscriptionDto>)
@Serializable data class SubscriptionDto(val id: String, val keyword: String, val active: Boolean, val createdAt: String, val nextRunAt: String)
@Serializable data class CreateSubscriptionRequest(val keyword: String)
@Serializable data class CreateSubscriptionResponse(
    val id: String,
    val keyword: String,
    val plan: SearchPlanDto,
    val planner: PlannerResultDto,
    val createdAt: String,
    val webhook: WebhookRegistrationDto,
)
@Serializable data class UpdateSubscriptionStatusRequest(val active: Boolean)

@Serializable data class SearchPlanDto(
    val topic: String,
    val normalizedKeywords: List<String>,
    val intervalSeconds: Int,
    val sources: List<SourcePlanDto>,
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
@JsonClassDiscriminator("provider")
sealed class SourcePlanDto {
    @Serializable @kotlinx.serialization.SerialName("naver") data class Naver(val query: String, val vertical: String) : SourcePlanDto()
    @Serializable @kotlinx.serialization.SerialName("x") data class X(val query: String) : SourcePlanDto()
    @Serializable @kotlinx.serialization.SerialName("rss") data class Rss(val url: String, val query: String? = null) : SourcePlanDto()
    @Serializable @kotlinx.serialization.SerialName("webhook") data class Webhook(val name: String) : SourcePlanDto()
}

@Serializable data class PlannerResultDto(val mode: String, val fallbackReason: String? = null)
@Serializable data class WebhookRegistrationDto(val url: String, val secret: String? = null, val secretHeader: String)

@Serializable data class EventsPageDto(val events: List<EventDto>, val nextCursor: Long, val hasMore: Boolean)
@Serializable data class EventDto(val cursor: Long, val subscriptionId: String, val item: EventItemDto, val createdAt: String, val bookmarked: Boolean = false)
@Serializable data class UpdateBookmarkRequest(val bookmarked: Boolean)
@Serializable data class EventItemDto(val provider: String, val externalId: String, val url: String, val title: String, val summary: String? = null, val publishedAt: String? = null, val firstSeenAt: String)
@Serializable data class RegisterDeviceRequest(val token: String, val platform: String)
@Serializable data class RegisterInstallationRequest(val platform: String, val fcmToken: String? = null)
@Serializable data class DeleteDeviceRequest(val token: String)

@Serializable data class ValidationErrorDto(val error: String, val details: ValidationErrorDetailsDto)
@Serializable data class ValidationErrorDetailsDto(val formErrors: List<String> = emptyList(), val fieldErrors: Map<String, List<String>> = emptyMap())
@Serializable data class RequestErrorDto(val error: String, val message: String)
@Serializable data class SimpleErrorDto(val error: String)
