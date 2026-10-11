package com.brainlessmusic.app.ui.update

import android.content.Intent
import androidx.lifecycle.ViewModel
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.playback.PlaybackResume
import com.brainlessmusic.app.update.UpdateRepository
import com.brainlessmusic.app.update.UpdateState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.StateFlow
import java.io.File
import javax.inject.Inject

/** The update sheet and the Settings row, over the app-wide [UpdateRepository]. */
@HiltViewModel
class UpdateViewModel @Inject constructor(
    private val updates: UpdateRepository,
    private val controller: PlaybackController,
    private val playbackResume: PlaybackResume,
) : ViewModel() {
    val state: StateFlow<UpdateState> = updates.state
    val sheetOpen: StateFlow<Boolean> = updates.sheetOpen
    val enabled: Boolean get() = updates.enabled

    /** Installing replaces the app, which stops the music. */
    val isPlaying: Boolean get() = controller.state.value.isPlaying

    fun checkNow() = updates.checkNow()
    fun later() = updates.later()
    fun skip(version: String) = updates.skip(version)
    fun download() = updates.download()
    fun canInstall(): Boolean = updates.canInstall()

    /** The queue is saved first, so the new version opens where this one stopped. */
    fun installIntent(file: File): Intent {
        playbackResume.flush()
        return updates.installIntent(file)
    }
}
