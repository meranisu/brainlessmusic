package com.brainlessmusic.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.brainlessmusic.app.playback.PlaybackResume
import com.brainlessmusic.app.ui.navigation.BrainlessNavGraph
import com.brainlessmusic.app.ui.theme.BrainlessMusicTheme
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    // Injected here so it exists from launch: it is what watches playback and saves it.
    @Inject lateinit var playbackResume: PlaybackResume

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
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
}
