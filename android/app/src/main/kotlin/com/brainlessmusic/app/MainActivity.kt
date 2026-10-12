package com.brainlessmusic.app

import com.brainlessmusic.app.ui.common.NoticeHost
import com.brainlessmusic.app.ui.common.Notices
import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import com.brainlessmusic.app.data.local.AppearanceSettings
import com.brainlessmusic.app.data.local.PlaybackSettings
import com.brainlessmusic.app.playback.PlaybackController
import com.brainlessmusic.app.playback.PlaybackResume
import com.brainlessmusic.app.rooms.RoomLinks
import com.brainlessmusic.app.rooms.RoomSession
import com.brainlessmusic.app.ui.navigation.BrainlessNavGraph
import com.brainlessmusic.app.ui.splash.StartViewModel
import com.brainlessmusic.app.ui.theme.BrainlessMusicTheme
import com.brainlessmusic.app.ui.theme.SkinTransition
import com.brainlessmusic.app.ui.splash.ArcadeGoodbye
import com.brainlessmusic.app.ui.splash.ArcadeWelcome
import com.brainlessmusic.app.ui.theme.isDark
import com.brainlessmusic.app.ui.update.UpdateSheetHost
import com.brainlessmusic.app.update.UpdateRepository
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import kotlinx.coroutines.flow.first
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
    @Inject lateinit var roomLinks: RoomLinks
    @Inject lateinit var updates: UpdateRepository
    @Inject lateinit var playbackSettings: PlaybackSettings

    // Mirrored so onDestroy can read it without blocking. Null until the first read lands: then nothing is paused.
    private var keepPlayingWhenSwipedAway: Boolean? = null

    // Activity-scoped, so the system splash and the nav graph's start screen wait on the same session check.
    private val startViewModel: StartViewModel by viewModels()

    // Removing the splash re-applies the theme's own bar colours, so edge-to-edge is set again after. A launch from the
    // media notification can do that without the exit callback, so regaining focus re-applies it as well.
    private var splashGone by mutableStateOf(false)
    private var focusGains by mutableIntStateOf(0)

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        lifecycleScope.launch { playbackSettings.keepPlayingWhenSwipedAway.collect { keepPlayingWhenSwipedAway = it } }
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
        // A newer release on GitHub: at most one look a day, quiet when offline (A104).
        updates.checkOnLaunch()
        // A room link that started the app. Not on a re-creation, which would replay the link already used.
        if (savedInstanceState == null) roomLinks.handle(intent)
        // Room notices (it ended, you were removed, a song couldn't be added) from whichever screen is open.
        lifecycleScope.launch {
            roomSession.messages.collect { Notices.show(it, long = true) }
        }
        // Read once, synchronously (two tiny preferences): otherwise every cold start would paint one frame in the
        // default colours before the saved choice arrived.
        val (initialMode, initialColors, initialSkin) = runBlocking {
            Triple(appearance.themeMode.first(), appearance.colorTheme.first(), appearance.skin.first())
        }
        setContent {
            val mode by appearance.themeMode.collectAsStateWithLifecycle(initialValue = initialMode)
            val colorTheme by appearance.colorTheme.collectAsStateWithLifecycle(initialValue = initialColors)
            val skin by appearance.skin.collectAsStateWithLifecycle(initialValue = initialSkin)
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
            BrainlessMusicTheme(colorTheme = colorTheme, darkTheme = darkTheme, skin = skin) {
                Surface(modifier = Modifier.fillMaxSize()) {
                    BrainlessNavGraph(startViewModel = startViewModel, roomLinks = roomLinks)
                    UpdateSheetHost()
                    NoticeHost()
                    ArcadeWelcome(startViewModel)
                    ArcadeGoodbye()
                    SkinTransition(skin)
                }
            }
        }
    }

    // singleTask: a room link tapped while the app is open arrives here, not as a second copy of the app.
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        roomLinks.handle(intent)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) focusGains++
    }

    override fun onStop() {
        super.onStop()
        playbackResume.flush()
    }

    /**
     * A backstop for [com.brainlessmusic.app.playback.PlaybackService.onTaskRemoved] (A58): on a Pixel (2026-10-11)
     * music played on after a swipe from recent apps with "Keep playing when swiped away" off. From Android 12, Back
     * leaves the root activity alive, and nothing in the app calls finish(), so finishing here means the task was
     * closed. Below 12 Back finishes it too, so this is left to the service there.
     */
    override fun onDestroy() {
        val closed = isFinishing && !isChangingConfigurations && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
        if (closed) {
            Log.i(TAG, "Task closed; keep playing when swiped away = $keepPlayingWhenSwipedAway")
            if (keepPlayingWhenSwipedAway == false) playbackController.stop(countAsSkip = false)
        }
        super.onDestroy()
    }
}

private const val SPLASH_HOLD_MAX_MS = 1_200L
private const val TAG = "MainActivity"
private const val SPLASH_FADE_MS = 200L
private const val SPLASH_REMOVE_GRACE_MS = 300L
