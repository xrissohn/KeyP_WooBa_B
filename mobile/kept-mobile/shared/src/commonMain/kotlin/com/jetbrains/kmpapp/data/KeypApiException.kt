package com.jetbrains.kmpapp.data

import com.jetbrains.kmpapp.data.dto.RequestErrorDto
import com.jetbrains.kmpapp.data.dto.ValidationErrorDto
import io.ktor.client.call.body
import io.ktor.client.plugins.ResponseException

/** Typed mapping of Interest Radar API error responses (see docs/API.md). */
sealed class KeypApiException(message: String) : Exception(message) {
    class Validation(val fieldErrors: Map<String, List<String>>, val formErrors: List<String>) :
        KeypApiException(fieldErrors.values.firstOrNull()?.firstOrNull() ?: formErrors.firstOrNull() ?: "입력값을 확인해 주세요.")
    class Request(val reason: String, override val message: String) : KeypApiException(message)
    class Unauthorized(override val message: String) : KeypApiException(message)
    data object NotFound : KeypApiException("요청한 항목을 찾을 수 없어요.")
    class Unknown(val status: Int) : KeypApiException("알 수 없는 오류가 발생했어요. (status=$status)")
}

internal suspend fun ResponseException.toKeypApiException(): KeypApiException {
    val status = response.status.value
    return when (status) {
        400 -> runCatching { response.body<ValidationErrorDto>() }
            .map { KeypApiException.Validation(it.details.fieldErrors, it.details.formErrors) }
            .getOrElse {
                runCatching { response.body<RequestErrorDto>() }
                    .map { KeypApiException.Request(it.error, it.message) }
                    .getOrDefault(KeypApiException.Unknown(status))
            }
        401 -> runCatching { response.body<RequestErrorDto>() }
            .map { KeypApiException.Unauthorized(it.message) }
            .getOrDefault(KeypApiException.Unauthorized("인증 정보가 없어요."))
        404 -> KeypApiException.NotFound
        else -> KeypApiException.Unknown(status)
    }
}
