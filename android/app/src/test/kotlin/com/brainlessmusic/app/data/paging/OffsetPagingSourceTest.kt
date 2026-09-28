package com.brainlessmusic.app.data.paging

import androidx.paging.PagingSource.LoadParams
import androidx.paging.PagingSource.LoadResult
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OffsetPagingSourceTest {

    private val all = (0 until 1000).toList()
    private val requests = mutableListOf<Pair<Int, Int>>()

    private val source = OffsetPagingSource<Int> { offset, limit ->
        requests += offset to limit
        Result.success(OffsetPage(all.drop(offset).take(limit), all.size))
    }

    private fun page(result: LoadResult<Int, Int>) = result as LoadResult.Page<Int, Int>

    @Test
    fun theFirstPageKnowsTheWholeLength() = runBlocking {
        val p = page(source.load(LoadParams.Refresh(null, 100, true)))
        assertEquals((0 until 100).toList(), p.data)
        assertEquals(0, p.itemsBefore)
        assertEquals(900, p.itemsAfter)
        assertNull(p.prevKey)
        assertEquals(100, p.nextKey)
    }

    @Test
    fun aJumpLoadsTheSliceAtThatRowAndCountsWhatIsBeforeIt() = runBlocking {
        val p = page(source.load(LoadParams.Refresh(600, 100, true)))
        assertEquals((600 until 700).toList(), p.data)
        assertEquals(600, p.itemsBefore)
        assertEquals(300, p.itemsAfter)
        assertEquals(600, p.prevKey)
        assertEquals(700, p.nextKey)
    }

    @Test
    fun appendContinuesFromWhereTheLoadedRunEnds() = runBlocking {
        val p = page(source.load(LoadParams.Append(700, 100, true)))
        assertEquals((700 until 800).toList(), p.data)
        assertEquals(800, p.nextKey)
    }

    @Test
    fun prependStopsAtTheStartWithoutOverlappingWhatIsLoaded() = runBlocking {
        // Loaded run begins at 40; a page of 100 must yield rows 0..39 only, not 0..99.
        val p = page(source.load(LoadParams.Prepend(40, 100, true)))
        assertEquals((0 until 40).toList(), p.data)
        assertNull(p.prevKey)
        assertEquals(0, p.itemsBefore)
    }

    @Test
    fun theLastPageHasNoNextKey() = runBlocking {
        val p = page(source.load(LoadParams.Append(950, 100, true)))
        assertEquals(50, p.data.size)
        assertNull(p.nextKey)
        assertEquals(0, p.itemsAfter)
    }

    @Test
    fun aFailureIsReportedNotThrown() = runBlocking {
        val failing = OffsetPagingSource<Int> { _, _ -> Result.failure(IllegalStateException("offline")) }
        val result = failing.load(LoadParams.Refresh(null, 100, true))
        assertTrue(result is LoadResult.Error)
    }

    @Test
    fun aListThatShrankDoesNotLoopForever() = runBlocking {
        val shrunk = OffsetPagingSource<Int> { _, _ -> Result.success(OffsetPage(emptyList(), 500)) }
        val p = page(shrunk.load(LoadParams.Append(300, 100, true)))
        assertNull(p.nextKey)
    }
}
