package com.brainlessmusic.app.playback

import com.brainlessmusic.app.data.repository.LibraryRepository
import javax.inject.Inject
import javax.inject.Singleton

// How many songs are fetched up front (the server's page cap); the queue is topped up from there as it runs down.
internal const val QUEUE_FROM_TAP = 200

/**
 * Plays the whole library in a seeded server shuffle (each song once per pass), in the mode picked on the shuffle
 * button (while it is off, the last mode it was on in), with player shuffle on. Shared by Library's shuffle button and
 * Home's Shuffle my library (A97).
 */
@Singleton
class LibraryShuffle @Inject constructor(
    private val libraryRepository: LibraryRepository,
    private val playbackController: PlaybackController,
) {
    /** Null once it plays; otherwise a line to show. */
    suspend fun start(): String? {
        val pass = QueueSource.Shuffled.fresh(playbackController.libraryShuffleMode())
        val page = libraryRepository.getShuffledPage(pass.seed, pass.mode.apiName ?: "shuffle", pass.asOf, 0, QUEUE_FROM_TAP)
            .getOrElse { return "Couldn't reach the server. Try again." }
        // Every song is sitting this pass out ("less often"), or there are none: say so, don't do nothing.
        if (page.tracks.isEmpty()) return "Nothing to shuffle this time. Songs you hear less often sit some shuffles out."
        playbackController.playQueue(
            items = page.tracks.map(libraryRepository::queueItem),
            startIndex = 0,
            source = pass.copy(nextOffset = page.tracks.size),
            shuffle = true,
        )
        return null
    }
}
