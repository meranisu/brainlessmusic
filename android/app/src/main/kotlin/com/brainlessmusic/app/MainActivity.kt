package com.brainlessmusic.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import com.brainlessmusic.app.data.local.AppearanceSettings
import com.brainlessmusic.app.data.local.ThemeMode
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.playback.PlaybackResume
import com.brainlessmusic.app.ui.navigation.BrainlessNavGraph
import com.brainlessmusic.app.ui.theme.BrainlessMusicTheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    // Injected here so it exists from launch: it is what watches playback and saves it.
    @Inject lateinit var playbackResume: PlaybackResume
    @Inject lateinit var playbackController: PlaybackController
    @Inject lateinit var appearance: AppearanceSettings

    // Without it Android 13+ hides the media notification, and with it the lock-screen controls.
    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        askForNotificationsOnFirstPlayback()
        // Read once, synchronously (a single tiny preference): otherwise a phone set to light with the app
        // forced to dark would paint one light frame on every cold start before the saved choice arrived.
        val initialMode = runBlocking { appearance.themeMode.first() }
        setContent {
            val mode by appearance.themeMode.collectAsStateWithLifecycle(initialValue = initialMode)
            val darkTheme = when (mode) {
                ThemeMode.SYSTEM -> isSystemInDarkTheme()
                ThemeMode.LIGHT -> false
                ThemeMode.DARK -> true
            }
            // The system bars' icon colors have to follow the app's choice, not the phone's.
            DisposableEffect(darkTheme) {
                enableEdgeToEdge(
                    statusBarStyle = SystemBarStyle.auto(
                        android.graphics.Color.TRANSPARENT,
                        android.graphics.Color.TRANSPARENT,
                    ) { darkTheme },
                    navigationBarStyle = SystemBarStyle.auto(
                        android.graphics.Color.TRANSPARENT,
                        android.graphics.Color.TRANSPARENT,
                    ) { darkTheme },
                )
                onDispose { }
            }
            BrainlessMusicTheme(darkTheme = darkTheme) {
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
