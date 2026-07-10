package com.jetbrains.kmpapp.data

import com.jetbrains.kmpapp.data.dto.CreateSubscriptionResponse
import com.jetbrains.kmpapp.data.dto.EventDto
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

class FeedRepository(private val api: KeypApi) {
    private val _items = MutableStateFlow<List<FeedItem>>(emptyList())
    val items = _items.asStateFlow()

    suspend fun refresh() {
        var cursor: Long? = null
        var hasMore = true
        while (hasMore) {
            val page = api.listEvents(cursor, limit = 50)
            cursor = page.nextCursor
            _items.value = (page.events.map {
                it.toFeedItem()
            } + _items.value)
                .distinctBy { it.id }
                .sortedByDescending { it.id.toLongOrNull() ?: 0L }
            hasMore = page.hasMore
        }
    }

    suspend fun toggleBookmark(id: String): FeedItem? {
        val current = _items.value.firstOrNull { it.id == id } ?: return null
        val updated = current.copy(bookmarked = !current.bookmarked)
        _items.value = _items.value.map { if (it.id == id) updated else it }
        return try {
            api.updateBookmark(id.toLong(), updated.bookmarked)
            updated
        } catch (error: Throwable) {
            _items.value = _items.value.map { if (it.id == id) current else it }
            throw error
        }
    }

    fun updateBookmark(id: String, bookmarked: Boolean) {
        _items.value = _items.value.map { if (it.id == id) it.copy(bookmarked = bookmarked) else it }
    }

    fun removeSubscription(subscriptionId: String) {
        _items.value = _items.value.filterNot { it.subscriptionId == subscriptionId }
    }
}

class BookmarkRepository(private val api: KeypApi) {
    private val _items = MutableStateFlow<List<FeedItem>>(emptyList())
    val items = _items.asStateFlow()

    suspend fun refresh() {
        var cursor: Long? = null
        var hasMore = true
        val collected = mutableListOf<FeedItem>()
        while (hasMore) {
            val page = api.listBookmarks(cursor, limit = 50)
            collected += page.events.map { it.toFeedItem() }
            cursor = page.nextCursor
            hasMore = page.hasMore
        }
        _items.value = collected.distinctBy { it.id }.sortedByDescending { it.id.toLongOrNull() ?: 0L }
    }

    fun sync(item: FeedItem) {
        _items.value = if (item.bookmarked) {
            (listOf(item) + _items.value.filterNot { it.id == item.id }).sortedByDescending { it.id.toLongOrNull() ?: 0L }
        } else {
            _items.value.filterNot { it.id == item.id }
        }
    }

    suspend fun remove(item: FeedItem) {
        _items.value = _items.value.filterNot { it.id == item.id }
        try {
            api.updateBookmark(item.id.toLong(), false)
        } catch (error: Throwable) {
            _items.value = (listOf(item) + _items.value).distinctBy { it.id }
            throw error
        }
    }
}

fun EventDto.toFeedItem() = FeedItem(
    id = cursor.toString(),
    subscriptionId = subscriptionId,
    provider = item.provider,
    title = item.title,
    summary = item.summary,
    url = item.url,
    createdAt = createdAt,
    bookmarked = bookmarked,
)

class DeviceRepository(private val api: KeypApi) {
    suspend fun registerInstallation(token: String?, platform: String) {
        api.registerInstallation(token, platform)
    }

    suspend fun setEnabled(enabled: Boolean, token: String?, platform: String) {
        if (token == null) return
        if (enabled) api.registerDevice(token, platform) else api.deleteDevice(token)
    }
}
