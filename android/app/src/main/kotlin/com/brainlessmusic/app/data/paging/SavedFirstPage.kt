package com.brainlessmusic.app.data.paging

import android.content.Context
import androidx.paging.PagingSource
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The first page of each library list, kept on disk so the list shows at once when the app opens while the real fetch
 * runs. The trip to the server is 0.2 to 1 s through the tunnel (measured 2026-10-20), far more than the server's own
 * time. Cleared on logout, so the next account never sees the last one's list.
 */
@Singleton
class LibraryPageStore @Inject constructor(@ApplicationContext context: Context) {
    private val dir = File(context.filesDir, "library_pages")
    private val gson = Gson()

    private class Saved<T>(val items: List<T>, val total: Int)

    suspend fun <T> load(name: String, itemClass: Class<T>): OffsetPage<T>? = withContext(Dispatchers.IO) {
        val file = File(dir, "$name.json")
        if (!file.exists()) return@withContext null
        runCatching {
            val type = TypeToken.getParameterized(Saved::class.java, itemClass).type
            val saved: Saved<T> = gson.fromJson(file.readText(), type)
            OffsetPage(saved.items, saved.total)
        }.getOrNull()
    }

    suspend fun <T> save(name: String, page: OffsetPage<T>) = withContext(Dispatchers.IO) {
        runCatching {
            dir.mkdirs()
            File(dir, "$name.json").writeText(gson.toJson(Saved(page.items, page.total)))
        }
    }

    suspend fun clear() = withContext(Dispatchers.IO) { dir.deleteRecursively() }
}

/** Whether a list is showing the saved first page: [UPDATING] while the fresh one is on its way, [FAILED] if it never came. */
enum class SavedPageState { NONE, UPDATING, FAILED }

/**
 * Serves a list's first page from [LibraryPageStore] once, fetches the real one behind it, and reloads the list only if
 * the two differ. Play never uses the saved copy: it fetches its own pages.
 */
class SavedFirstPage<T : Any>(
    private val store: LibraryPageStore,
    private val name: String,
    private val itemClass: Class<T>,
    private val scope: CoroutineScope,
) {
    private val _state = MutableStateFlow(SavedPageState.NONE)
    val state: StateFlow<SavedPageState> = _state.asStateFlow()

    /** Set to `false` once a fresh first page has arrived; from then on page 0 always comes from the server. */
    private var serveSaved = true

    /** The paging source on screen, so a changed list can be reloaded. */
    var source: PagingSource<*, *>? = null

    fun wrap(fetch: suspend (offset: Int, limit: Int) -> Result<OffsetPage<T>>): suspend (Int, Int) -> Result<OffsetPage<T>> =
        { offset, limit ->
            if (offset != 0) {
                fetch(offset, limit)
            } else {
                val saved = if (serveSaved) store.load(name, itemClass) else null
                if (saved != null && saved.items.size == limit.coerceAtMost(saved.total)) {
                    _state.value = SavedPageState.UPDATING
                    scope.launch { refreshBehind(fetch, limit, saved) }
                    Result.success(saved)
                } else {
                    fetch(0, limit).onSuccess { fresh ->
                        serveSaved = false
                        _state.value = SavedPageState.NONE
                        store.save(name, fresh)
                    }
                }
            }
        }

    private suspend fun refreshBehind(fetch: suspend (Int, Int) -> Result<OffsetPage<T>>, limit: Int, saved: OffsetPage<T>) {
        fetch(0, limit)
            .onSuccess { fresh ->
                serveSaved = false
                store.save(name, fresh)
                _state.value = SavedPageState.NONE
                if (fresh.total != saved.total || fresh.items != saved.items) source?.invalidate()
            }
            .onFailure { _state.value = SavedPageState.FAILED }
    }
}
