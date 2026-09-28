package com.brainlessmusic.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.playback.PlaybackResume
import com.brainlessmusic.app.ui.navigation.BrainlessNavGraph
import com.brainlessmusic.app.ui.theme.BrainlessMusicTheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    // Injected here so it exists from launch: it is what watches playback and saves it.
    @Inject lateinit var playbackResume: PlaybackResume
    @Inject lateinit var playbackController: PlaybackController

    // Without it Android 13+ hides the media notification, and with it the lock-screen controls.
    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        askForNotificationsOnFirstPlayback()
        setContent {
            BrainlessMusicTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    BrainlessNavGraph()
                }
            }
        }
    }

    override fun onStop() {
        super.onStop()
        playbackResume.flush()
    }

    /** Asked when music first starts rather than at launch, when the reason for asking is obvious. */
    private fun askForNotificationsOnFirstPlayback() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val granted = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        if (granted) return
        lifecycleScope.launch {
            playbackController.state.map { it.hasQueue }.first { it }
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}
