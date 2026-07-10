package com.jetbrains.kmpapp.data

import com.jetbrains.kmpapp.data.dto.CreateSubscriptionResponse
import com.jetbrains.kmpapp.model.FeedItem
import com.jetbrains.kmpapp.model.Interest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

class SubscriptionRepository(private val api: KeypApi, private val feedRepository: FeedRepository) {
    private val _interests = MutableStateFlow<List<Interest>>(emptyList())
    val interests = _interests.asStateFlow()

    suspend fun refresh() {
        _interests.value = api.listSubscriptions().map { Interest(it.id, it.keyword, it.active) }
    }

    suspend fun create(keyword: String): CreateSubscriptionResponse {
        val result = api.createSubscription(keyword)
        _interests.value = listOf(Interest(result.id, result.keyword, active = true)) + _interests.value
        return result
    }

    suspend fun toggle(id: String) {
        val current = _interests.value.firstOrNull { it.id == id } ?: return
        api.updateSubscriptionStatus(id, !current.active)
        _interests.value = _interests.value.map { if (it.id == id) it.copy(active = !it.active) else it }
    }

    suspend fun delete(id: String) {
        api.deleteSubscription(id)
        _interests.value = _interests.value.filterNot { it.id == id }
        feedRepository.removeSubscription(id)
    }
}

class FeedRepository(private val api: KeypApi, private val cursorStore: CursorStore) {
    private var cursor: Long? = cursorStore.get()
    private val _items = MutableStateFlow<List<FeedItem>>(emptyList())
    val items = _items.asStateFlow()

    suspend fun refresh() {
        var hasMore = true
        while (hasMore) {
            val page = api.listEvents(cursor, limit = 50)
            cursor = page.nextCursor
            cursorStore.set(page.nextCursor)
            _items.value = (page.events.map {
                FeedItem(
                    id = it.cursor.toString(),
                    subscriptionId = it.subscriptionId,
                    provider = it.item.provider,
                    title = it.item.title,
                    summary = it.item.summary,
                    url = it.item.url,
                    createdAt = it.createdAt,
                )
            } + _items.value)
                .distinctBy { it.id }
                .sortedByDescending { it.id.toLongOrNull() ?: 0L }
            hasMore = page.hasMore
        }
    }

    fun toggleBookmark(id: String) {
        _items.value = _items.value.map { if (it.id == id) it.copy(bookmarked = !it.bookmarked) else it }
    }

    fun removeSubscription(subscriptionId: String) {
        _items.value = _items.value.filterNot { it.subscriptionId == subscriptionId }
    }
}

class DeviceRepository(private val api: KeypApi) {
    suspend fun setEnabled(enabled: Boolean, token: String?, platform: String) {
        if (token == null) return
        if (enabled) api.registerDevice(token, platform) else api.deleteDevice(token)
    }
}
