package com.brainlessmusic.app.data.paging

import androidx.paging.PagingSource
import androidx.paging.PagingState

/** One slice of a server list plus the list's full length, which is what lets the UI show a scrollbar-sized list up front. */
class OffsetPage<T>(val items: List<T>, val total: Int)

/**
 * Pages a server list by `limit`/`offset` and — the point of it — reports how many rows sit before and after
 * each slice, so the list knows its full length from the first page and can be scrolled to any row (the
 * alphabet rail jumping to "M") without loading everything before it. Unloaded rows show as placeholders
 * until their page arrives.
 *
 * [fetch] must not ask for more than the server allows per request (200); the pager's page size keeps it under.
 */
class OffsetPagingSource<T : Any>(
    private val fetch: suspend (offset: Int, limit: Int) -> Result<OffsetPage<T>>,
) : PagingSource<Int, T>() {

    override val jumpingSupported: Boolean = true

    override suspend fun load(params: LoadParams<Int>): LoadResult<Int, T> {
        val size = params.loadSize
        // `key` is where the slice that is already loaded begins (prepend) or ends (append); a refresh asks for a
        // slice around the row the UI is looking at.
        val start = when (params) {
            is LoadParams.Refresh -> (params.key ?: 0).coerceAtLeast(0)
            is LoadParams.Append -> params.key
            is LoadParams.Prepend -> (params.key - size).coerceAtLeast(0)
        }
        val limit = if (params is LoadParams.Prepend) minOf(size, params.key) else size
        if (limit <= 0) return LoadResult.Page(emptyList(), prevKey = null, nextKey = null)

        val page = fetch(start, limit).getOrElse { return LoadResult.Error(it) }
        val end = start + page.items.size
        return LoadResult.Page(
            data = page.items,
            prevKey = if (start == 0) null else start,
            // An empty slice with rows supposedly left (the list shrank under us) would loop forever; stop.
            nextKey = if (page.items.isEmpty() || end >= page.total) null else end,
            itemsBefore = start,
            itemsAfter = (page.total - end).coerceAtLeast(0),
        )
    }

    /** After an invalidation, reload around the row the user was on rather than jumping back to the top. */
    override fun getRefreshKey(state: PagingState<Int, T>): Int? =
        state.anchorPosition?.let { (it - state.config.initialLoadSize / 2).coerceAtLeast(0) }
}
