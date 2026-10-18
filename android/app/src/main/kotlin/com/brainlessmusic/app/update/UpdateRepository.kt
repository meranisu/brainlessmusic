package com.brainlessmusic.app.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.content.FileProvider
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import com.brainlessmusic.app.BuildConfig
import com.google.gson.Gson
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton

sealed interface UpdateState {
    data object Idle : UpdateState
    data object Checking : UpdateState
    data class UpToDate(val version: String) : UpdateState
    data class Available(val offer: UpdateOffer) : UpdateState
    /** [progress] 0–1, or null while the size is unknown. */
    data class Downloading(val offer: UpdateOffer, val progress: Float?) : UpdateState
    data class Ready(val offer: UpdateOffer, val file: File) : UpdateState
    data class Failed(val offer: UpdateOffer?, val message: String) : UpdateState
}

/**
 * In-app updates from GitHub Releases (A104–A106): a check on launch at most once a day plus one from Settings, the
 * download checked against GitHub's SHA-256, then Android's own installer. Release builds only: a debug build is a
 * different app (`.debug`) and never offers itself a release. Plan: `.docs/features/app-self-update/planning.md`.
 */
@Singleton
class UpdateRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    okHttpClient: OkHttpClient,
    private val dataStore: DataStore<Preferences>,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    // The shared client's pool, without its interceptors: the server's sign-in token must never go to GitHub.
    private val http = okHttpClient.newBuilder().apply { interceptors().clear() }.build()
    private val gson = Gson()

    private val _state = MutableStateFlow<UpdateState>(UpdateState.Idle)
    val state: StateFlow<UpdateState> = _state.asStateFlow()

    private val _sheetOpen = MutableStateFlow(false)

    /** Whether the update sheet should be showing. */
    val sheetOpen: StateFlow<Boolean> = _sheetOpen.asStateFlow()

    private var downloadJob: Job? = null

    val enabled: Boolean get() = !BuildConfig.DEBUG

    /** On launch: at most once a day, quiet when offline. */
    fun checkOnLaunch() {
        if (!enabled || _state.value !is UpdateState.Idle) return
        scope.launch {
            val prefs = dataStore.data.first()
            val now = System.currentTimeMillis()
            if (now - (prefs[LAST_CHECK_KEY] ?: 0L) < DAY_MS) return@launch
            // Only a check that reached GitHub counts: an offline launch tries again next time, not a day later.
            val offer = fetchOffer().getOrElse { return@launch }
            dataStore.edit { it[LAST_CHECK_KEY] = now }
            if (offer == null) return@launch
            _state.value = UpdateState.Available(offer)
            _sheetOpen.value = true
        }
    }

    /** From Settings: ignores the daily gate, and says so when there's nothing new. */
    fun checkNow() {
        if (!enabled) return
        when (_state.value) {
            is UpdateState.Checking -> return
            is UpdateState.Downloading, is UpdateState.Ready, is UpdateState.Available -> {
                _sheetOpen.value = true
                return
            }
            else -> Unit
        }
        _state.value = UpdateState.Checking
        scope.launch {
            fetchOffer().fold(
                onSuccess = { offer ->
                    if (offer == null) {
                        _state.value = UpdateState.UpToDate(BuildConfig.VERSION_NAME)
                    } else {
                        _state.value = UpdateState.Available(offer)
                        _sheetOpen.value = true
                    }
                },
                onFailure = { _state.value = UpdateState.Failed(null, "Couldn't reach GitHub. Check your connection and try again.") },
            )
        }
    }

    /**
     * Later, the only way to wave it off: the next launch check (a day on) or the settings row brings it back. "Skip
     * this version" was dropped as the same thing with extra steps (owner, 2026-10-11, over A105).
     */
    fun later() {
        _sheetOpen.value = false
    }

    fun download() {
        val offer = when (val s = _state.value) {
            is UpdateState.Available -> s.offer
            is UpdateState.Failed -> s.offer ?: return
            else -> return
        }
        downloadJob?.cancel()
        _state.value = UpdateState.Downloading(offer, null)
        downloadJob = scope.launch {
            _state.value = try {
                UpdateState.Ready(offer, fetchApk(offer))
            } catch (e: CancellationException) {
                throw e
            } catch (e: ChecksumMismatch) {
                UpdateState.Failed(offer, "The download didn't match the release, so it was thrown away. Try again.")
            } catch (e: Exception) {
                UpdateState.Failed(offer, "The download stopped. Check your connection and try again.")
            }
        }
    }

    /**
     * What to open for the downloaded APK: Android's installer, or first the "Install unknown apps" setting for this
     * app when it isn't allowed yet. The person always confirms in Android's own dialog.
     */
    fun installIntent(file: File): Intent {
        if (!context.packageManager.canRequestPackageInstalls()) {
            return Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
        }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.updates", file)
        return Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, APK_MIME)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }

    /** Whether opening [installIntent] now goes to the installer rather than the permission setting. */
    fun canInstall(): Boolean = context.packageManager.canRequestPackageInstalls()

    private suspend fun fetchOffer(): Result<UpdateOffer?> = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url("https://api.github.com/repos/$REPO/releases?per_page=30")
                .header("Accept", "application/vnd.github+json")
                .build()
            http.newCall(request).execute().use { response ->
                if (!response.isSuccessful) error("GitHub answered ${response.code}")
                // An array, not a TypeToken list: R8 can strip the generic signature a TypeToken reads.
                val body = response.body ?: error("GitHub sent an empty response")
                val releases = gson.fromJson(body.charStream(), Array<GithubRelease>::class.java)
                Result.success(pickOffer(releases.toList(), BuildConfig.VERSION_NAME))
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /** Streams the APK into the cache, hashing as it goes; a mismatch with GitHub's SHA-256 deletes it. */
    private suspend fun fetchApk(offer: UpdateOffer): File = withContext(Dispatchers.IO) {
        val dir = File(context.cacheDir, UPDATES_DIR).apply { mkdirs() }
        // Only one APK is ever kept: older ones are dead weight.
        dir.listFiles()?.forEach { it.delete() }
        val file = File(dir, "brainlessmusic-v${offer.version}.apk")
        val digest = MessageDigest.getInstance("SHA-256")
        http.newCall(Request.Builder().url(offer.apkUrl).build()).execute().use { response ->
            if (!response.isSuccessful) error("Download answered ${response.code}")
            val body = response.body ?: error("Download sent an empty response")
            val total = body.contentLength().takeIf { it > 0 } ?: offer.apkBytes
            var done = 0L
            var lastShown = -1
            body.byteStream().use { input ->
                file.outputStream().use { output ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        // A blocking read never notices a cancel by itself; without this a cancelled download would
                        // keep writing Downloading over whatever state came after.
                        ensureActive()
                        val read = input.read(buffer)
                        if (read < 0) break
                        output.write(buffer, 0, read)
                        digest.update(buffer, 0, read)
                        done += read
                        val percent = if (total > 0) (done * 100 / total).toInt() else -1
                        if (percent != lastShown) {
                            lastShown = percent
                            _state.value = UpdateState.Downloading(offer, if (percent >= 0) percent / 100f else null)
                        }
                    }
                }
            }
        }
        val actual = digest.digest().joinToString("") { "%02x".format(it) }
        if (offer.sha256 != null && actual != offer.sha256) {
            file.delete()
            throw ChecksumMismatch()
        }
        file
    }

    private class ChecksumMismatch : Exception()

    private companion object {
        const val REPO = "meranisu/brainlessmusic"
        const val APK_MIME = "application/vnd.android.package-archive"
        const val UPDATES_DIR = "updates"
        const val DAY_MS = 24 * 60 * 60 * 1000L
        val LAST_CHECK_KEY = longPreferencesKey("update_last_check")
    }
}
