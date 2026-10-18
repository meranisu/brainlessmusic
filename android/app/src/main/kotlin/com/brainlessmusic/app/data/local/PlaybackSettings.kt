package com.brainlessmusic.app.data.local

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import com.brainlessmusic.app.playback.HeadsetAction
import com.brainlessmusic.app.playback.HeadsetButtonPrefs
import com.brainlessmusic.app.playback.HeadsetSlot
import com.brainlessmusic.app.playback.ShuffleMode
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

/** Playback preferences. Kept through logout: [SessionStore.clearCredentials] removes only its own keys. */
@Singleton
class PlaybackSettings @Inject constructor(
    private val dataStore: DataStore<Preferences>,
) {
    /** Whether reopening the app plays the saved queue. Off by default: A9 restores paused. */
    val autoPlayOnResume: Flow<Boolean> = dataStore.data.map { it[AUTO_PLAY_ON_RESUME_KEY] ?: false }

    suspend fun setAutoPlayOnResume(enabled: Boolean) {
        dataStore.edit { it[AUTO_PLAY_ON_RESUME_KEY] = enabled }
    }

    /** Whether music carries on after the app is swiped away from recents. On by default, like other music apps (A58). */
    val keepPlayingWhenSwipedAway: Flow<Boolean> = dataStore.data.map { it[KEEP_PLAYING_WHEN_SWIPED_KEY] ?: true }

    suspend fun setKeepPlayingWhenSwipedAway(enabled: Boolean) {
        dataStore.edit { it[KEEP_PLAYING_WHEN_SWIPED_KEY] = enabled }
    }

    /**
     * Whether tapping a song keeps the shuffle that was on. Off by default, like YouTube Music: a tapped song plays its
     * list in order, and only the shuffle buttons turn shuffle on.
     */
    val keepShuffle: Flow<Boolean> = dataStore.data.map { it[KEEP_SHUFFLE_KEY] ?: false }

    suspend fun setKeepShuffle(enabled: Boolean) {
        dataStore.edit { it[KEEP_SHUFFLE_KEY] = enabled }
    }

    /** Remembered across launches so the next queue starts the way the last one was left. Before A77 it was on/off. */
    val shuffleMode: Flow<ShuffleMode> = dataStore.data.map { prefs ->
        prefs[SHUFFLE_MODE_KEY]?.let { name -> ShuffleMode.entries.firstOrNull { it.name == name } }
            ?: if (prefs[SHUFFLE_KEY] == true) ShuffleMode.SHUFFLE else ShuffleMode.OFF
    }

    suspend fun setShuffleMode(mode: ShuffleMode) {
        dataStore.edit {
            // Installs from before v0.3.15 never wrote the last mode: keep the one being turned off, or it is lost.
            if (it[LAST_SHUFFLE_MODE_KEY] == null) it[SHUFFLE_MODE_KEY]?.let { old -> it[LAST_SHUFFLE_MODE_KEY] = old }
            it[SHUFFLE_MODE_KEY] = mode.name
            if (mode != ShuffleMode.OFF) it[LAST_SHUFFLE_MODE_KEY] = mode.name
        }
    }

    /**
     * The last mode shuffle was on in, kept while it is off, so the shuffle buttons come back to it (Q86). Installs from
     * before v0.3.15 never wrote it, so the current mode stands in until [setShuffleMode] does.
     */
    val lastShuffleMode: Flow<ShuffleMode> = dataStore.data.map { prefs ->
        val saved = prefs[LAST_SHUFFLE_MODE_KEY] ?: prefs[SHUFFLE_MODE_KEY]
        saved?.let { name -> ShuffleMode.entries.firstOrNull { it.name == name } }
            ?.takeIf { it != ShuffleMode.OFF } ?: ShuffleMode.SHUFFLE
    }

    /** A `Player.REPEAT_MODE_*` value. */
    val repeatMode: Flow<Int> = dataStore.data.map { it[REPEAT_KEY] ?: 0 }

    suspend fun setRepeatMode(mode: Int) {
        dataStore.edit { it[REPEAT_KEY] = mode }
    }

    /**
     * Whether songs stream as the server's smaller data-saver copy (`?quality=low`) instead of the file. Off by default.
     * The server sends the file anyway when it is already small.
     */
    val dataSaver: Flow<Boolean> = dataStore.data.map { it[DATA_SAVER_KEY] ?: false }

    suspend fun setDataSaver(enabled: Boolean) {
        dataStore.edit { it[DATA_SAVER_KEY] = enabled }
    }

    /** The most downloads may take, in GB; 0 is no limit, the default (A88). */
    val downloadLimitGb: Flow<Int> = dataStore.data.map { it[DOWNLOAD_LIMIT_GB_KEY] ?: 0 }

    suspend fun setDownloadLimitGb(gb: Int) {
        dataStore.edit { it[DOWNLOAD_LIMIT_GB_KEY] = gb }
    }

    /** The most the cache of played songs may take, in MB; 0 is unlimited. 1 GB by default (A198). */
    val songCacheLimitMb: Flow<Int> = dataStore.data.map { it[SONG_CACHE_LIMIT_MB_KEY] ?: SONG_CACHE_DEFAULT_MB }

    suspend fun setSongCacheLimitMb(mb: Int) {
        dataStore.edit { it[SONG_CACHE_LIMIT_MB_KEY] = mb }
    }

    /** How many songs after the playing one are fetched ahead while online; 0 is off. 3 by default. */
    val precacheCount: Flow<Int> = dataStore.data.map { it[PRECACHE_COUNT_KEY] ?: PRECACHE_DEFAULT_COUNT }

    suspend fun setPrecacheCount(count: Int) {
        dataStore.edit { it[PRECACHE_COUNT_KEY] = count }
    }

    /** Gapless, crossfade or fade out then in, the pause fade and the album rule (A71, A72). */
    val transitions: Flow<TransitionPrefs> = dataStore.data.map { prefs ->
        val defaults = TransitionPrefs()
        TransitionPrefs(
            betweenSongs = prefs[BETWEEN_SONGS_KEY]?.let { name -> BetweenSongs.entries.firstOrNull { it.name == name } }
                ?: defaults.betweenSongs,
            fadeSeconds = prefs[FADE_SECONDS_KEY]?.takeIf { it in FADE_LENGTHS } ?: defaults.fadeSeconds,
            fadeOnPause = prefs[FADE_ON_PAUSE_KEY] ?: defaults.fadeOnPause,
            keepAlbumsGapless = prefs[KEEP_ALBUMS_GAPLESS_KEY] ?: defaults.keepAlbumsGapless,
            levelVolume = prefs[LEVEL_VOLUME_KEY] ?: defaults.levelVolume,
        )
    }

    suspend fun setBetweenSongs(value: BetweenSongs) {
        dataStore.edit { it[BETWEEN_SONGS_KEY] = value.name }
    }

    suspend fun setFadeSeconds(seconds: Int) {
        dataStore.edit { it[FADE_SECONDS_KEY] = seconds }
    }

    suspend fun setFadeOnPause(enabled: Boolean) {
        dataStore.edit { it[FADE_ON_PAUSE_KEY] = enabled }
    }

    suspend fun setKeepAlbumsGapless(enabled: Boolean) {
        dataStore.edit { it[KEEP_ALBUMS_GAPLESS_KEY] = enabled }
    }

    suspend fun setLevelVolume(enabled: Boolean) {
        dataStore.edit { it[LEVEL_VOLUME_KEY] = enabled }
    }

    /** What each headset press or button does (A203). Per phone, so a wired headset and earbuds share one choice. */
    val headsetButtons: Flow<HeadsetButtonPrefs> = dataStore.data.map { prefs ->
        val defaults = HeadsetButtonPrefs()
        fun pick(slot: HeadsetSlot): HeadsetAction =
            prefs[headsetKey(slot)]?.let { name -> HeadsetAction.entries.firstOrNull { it.name == name } } ?: defaults[slot]
        HeadsetButtonPrefs(
            single = pick(HeadsetSlot.SINGLE),
            double = pick(HeadsetSlot.DOUBLE),
            triple = pick(HeadsetSlot.TRIPLE),
            nextButton = pick(HeadsetSlot.NEXT_BUTTON),
            previousButton = pick(HeadsetSlot.PREVIOUS_BUTTON),
        )
    }

    suspend fun setHeadsetAction(slot: HeadsetSlot, action: HeadsetAction) {
        dataStore.edit { it[headsetKey(slot)] = action.name }
    }

    private companion object {
        fun headsetKey(slot: HeadsetSlot) = stringPreferencesKey("headset_${slot.name.lowercase()}")

        val SHUFFLE_KEY = booleanPreferencesKey("shuffle")
        val SHUFFLE_MODE_KEY = stringPreferencesKey("shuffle_mode")
        val KEEP_SHUFFLE_KEY = booleanPreferencesKey("keep_shuffle")
        val LAST_SHUFFLE_MODE_KEY = stringPreferencesKey("last_shuffle_mode")
        val REPEAT_KEY = intPreferencesKey("repeat_mode")
        val AUTO_PLAY_ON_RESUME_KEY = booleanPreferencesKey("auto_play_on_resume")
        val KEEP_PLAYING_WHEN_SWIPED_KEY = booleanPreferencesKey("keep_playing_when_swiped_away")
        val BETWEEN_SONGS_KEY = stringPreferencesKey("between_songs")
        val FADE_SECONDS_KEY = intPreferencesKey("fade_seconds")
        val FADE_ON_PAUSE_KEY = booleanPreferencesKey("fade_on_pause")
        val KEEP_ALBUMS_GAPLESS_KEY = booleanPreferencesKey("keep_albums_gapless")
        val LEVEL_VOLUME_KEY = booleanPreferencesKey("level_volume")
        val DATA_SAVER_KEY = booleanPreferencesKey("data_saver")
        val DOWNLOAD_LIMIT_GB_KEY = intPreferencesKey("download_limit_gb")
        val SONG_CACHE_LIMIT_MB_KEY = intPreferencesKey("song_cache_limit_mb")
        val PRECACHE_COUNT_KEY = intPreferencesKey("precache_count")
    }
}

const val SONG_CACHE_DEFAULT_MB = 1024

/** The cache sizes Settings offers, in MB; 0 is unlimited (A198). */
val SONG_CACHE_LIMITS_MB = listOf(500, 1024, 2048, 5120, 0)

const val PRECACHE_DEFAULT_COUNT = 3

/** The "Fetch ahead" choices, in songs; 0 is off. */
val PRECACHE_COUNTS = listOf(0, 1, 3, 5, 10)
