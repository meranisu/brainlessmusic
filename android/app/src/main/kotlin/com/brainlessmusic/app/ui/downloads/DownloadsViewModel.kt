package com.brainlessmusic.app.ui.downloads

import androidx.annotation.OptIn
import androidx.core.net.toUri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.util.UnstableApi
import com.brainlessmusic.app.data.remote.NetworkMonitor
import com.brainlessmusic.app.downloads.DownloadDao
import com.brainlessmusic.app.downloads.DownloadGroup
import com.brainlessmusic.app.downloads.DownloadRepository
import com.brainlessmusic.app.downloads.GroupDownload
import com.brainlessmusic.app.downloads.groupDownload
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.ui.common.LoadState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.io.File
import javax.inject.Inject

/** One row: a downloaded album (or, later, playlist) and how much of it is on the phone. */
data class DownloadRow(
    val group: DownloadGroup,
    val trackIds: List<Int>,
    val doneCount: Int,
    val state: GroupDownload,
) {
    /** A file URI Coil and the media notification can both read. */
    val coverUri: String? get() = group.coverPath?.let { File(it).toUri().toString() }
}

@OptIn(UnstableApi::class)
@HiltViewModel
class DownloadsViewModel @Inject constructor(
    dao: DownloadDao,
    private val downloads: DownloadRepository,
    private val playbackController: PlaybackController,
    networkMonitor: NetworkMonitor,
) : ViewModel() {

    private val reload = MutableStateFlow(0)

    @kotlin.OptIn(ExperimentalCoroutinesApi::class)
    val rows: StateFlow<LoadState<List<DownloadRow>>> = reload.flatMapLatest {
        combine(dao.groups(), dao.groupTracks(), downloads.downloads) { groups, links, states ->
            val byGroup = links.groupBy({ it.groupId }, { it.trackId })
            val rows = groups.map { g ->
                val ids = byGroup[g.id].orEmpty()
                DownloadRow(g, ids, ids.count { states[it]?.isDone == true }, groupDownload(ids, states))
            }
            LoadState.Content(rows)
        }.catch<LoadState<List<DownloadRow>>> { emit(LoadState.Error("Couldn't read your downloads.")) }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), LoadState.Loading)

    val spaceUsed: StateFlow<Long> = downloads.spaceUsed

    val online: StateFlow<Boolean> = networkMonitor.online

    /** A download got a 401: the queue waits for a sign-in. */
    val needsSignIn: StateFlow<Boolean> = downloads.needsSignIn

    fun retryLoad() {
        reload.value++
    }

    /**
     * Plays the group from its first song, or shuffled. With no signal only the songs on the phone go in the queue.
     * [onNothingToPlay] says why nothing started.
     */
    fun play(row: DownloadRow, shuffle: Boolean, onNothingToPlay: (String) -> Unit) {
        viewModelScope.launch {
            val items = downloads.queueOf(row.group.id, onlyDownloaded = !online.value)
            if (items.isEmpty()) {
                onNothingToPlay("None of these songs are on the phone yet.")
                return@launch
            }
            val start = if (shuffle) items.indices.random() else 0
            playbackController.playQueue(items, start, shuffle = shuffle)
        }
    }

    /** Starts the songs that failed or never started; finished ones are left alone. */
    fun retry(row: DownloadRow) = downloads.download(row.trackIds)

    fun remove(row: DownloadRow) = downloads.removeGroup(row.group.id, row.trackIds)
}

/** "12 songs", or "8 of 12 songs" while some aren't on the phone. */
internal fun songCount(done: Int, total: Int): String {
    val songs = if (total == 1) "1 song" else "$total songs"
    return if (done == total) songs else "$done of $songs"
}

internal fun DownloadRow.status(): String = when (state) {
    is GroupDownload.Running -> "Downloading, ${state.percent}%"
    GroupDownload.Failed -> "Some songs failed. Retry from the menu."
    else -> listOfNotNull(group.subtitle, songCount(doneCount, trackIds.size)).joinToString(" · ")
}

internal val DownloadRow.canRetry: Boolean
    get() = state == GroupDownload.Failed || (state == GroupDownload.None && doneCount < trackIds.size)
