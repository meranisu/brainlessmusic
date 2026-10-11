package com.brainlessmusic.app

import android.Manifest
import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import com.brainlessmusic.app.data.local.AppearanceSettings
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.playback.PlaybackResume
import com.brainlessmusic.app.rooms.RoomSession
import com.brainlessmusic.app.ui.navigation.BrainlessNavGraph
import com.brainlessmusic.app.ui.splash.StartViewModel
import com.brainlessmusic.app.ui.theme.BrainlessMusicTheme
import com.brainlessmusic.app.ui.theme.isDark
import com.brainlessmusic.app.ui.update.UpdateSheetHost
import com.brainlessmusic.app.update.UpdateRepository
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    // Injected here so it exists from launch: it is what watches playback and saves it.
    @Inject lateinit var playbackResume: PlaybackResume
    @Inject lateinit var playbackController: PlaybackController
    @Inject lateinit var appearance: AppearanceSettings
    // From launch too, so a restarted app gets back into the room it was in.
    @Inject lateinit var roomSession: RoomSession
    @Inject lateinit var updates: UpdateRepository

    // Activity-scoped, so the system splash and the nav graph's start screen wait on the same session check.
    private val startViewModel: StartViewModel by viewModels()

    // Removing the splash re-applies the theme's own bar colours, so edge-to-edge is set again after. A launch from the
    // media notification can do that without the exit callback, so regaining focus re-applies it as well.
    private var splashGone by mutableStateOf(false)
    private var focusGains by mutableIntStateOf(0)

    // Without it Android 13+ hides the media notification, and with it the lock-screen controls.
    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        // Held until we know where to go, so a cold start never shows an empty screen. Capped: the check can wait on
        // a slow network, and past that the in-app splash (with a progress bar) takes over in the same place.
        val launchedAt = SystemClock.uptimeMillis()
        splash.setKeepOnScreenCondition {
            startViewModel.resolvedRoute.value == null && SystemClock.uptimeMillis() - launchedAt < SPLASH_HOLD_MAX_MS
        }
        splash.setOnExitAnimationListener { provider ->
            // The splash view sits over the whole app and takes every touch, so it must go however the fade ends.
            // `withEndAction` skips a cancelled fade (app sent to the background mid-fade), which left a blank screen
            // that only killing the app cleared. Hence end or cancel, plus a timed fallback; whichever comes first.
            var removed = false
            fun remove() {
                if (removed) return
                removed = true
                provider.remove()
                splashGone = true
            }
            provider.view.animate()
                .alpha(0f)
                .setDuration(SPLASH_FADE_MS)
                .setListener(object : AnimatorListenerAdapter() {
                    override fun onAnimationEnd(animation: Animator) = remove()
                    override fun onAnimationCancel(animation: Animator) = remove()
                })
                .start()
            Handler(Looper.getMainLooper()).postDelayed(::remove, SPLASH_FADE_MS + SPLASH_REMOVE_GRACE_MS)
        }
        askForNotificationsOnFirstPlayback()
        // A newer release on GitHub: at most one look a day, quiet when offline (A104).
        updates.checkOnLaunch()
        // Room notices (it ended, you were removed, a song couldn't be added) from whichever screen is open.
        lifecycleScope.launch {
            roomSession.messages.collect { Toast.makeText(this@MainActivity, it, Toast.LENGTH_LONG).show() }
        }
        // Read once, synchronously (two tiny preferences): otherwise every cold start would paint one frame in the
        // default colours before the saved choice arrived.
        val (initialMode, initialColors) = runBlocking { appearance.themeMode.first() to appearance.colorTheme.first() }
        setContent {
            val mode by appearance.themeMode.collectAsStateWithLifecycle(initialValue = initialMode)
            val colorTheme by appearance.colorTheme.collectAsStateWithLifecycle(initialValue = initialColors)
            val darkTheme = mode.isDark()
            // The system bars' icon colors have to follow the app's choice, not the phone's.
            DisposableEffect(darkTheme, splashGone, focusGains) {
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
            BrainlessMusicTheme(colorTheme = colorTheme, darkTheme = darkTheme) {
                Surface(modifier = Modifier.fillMaxSize()) {
                    BrainlessNavGraph(startViewModel = startViewModel)
                    UpdateSheetHost()
                }
            }
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) focusGains++
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

private const val SPLASH_HOLD_MAX_MS = 1_200L
private const val SPLASH_FADE_MS = 200L
private const val SPLASH_REMOVE_GRACE_MS = 300L
