package com.brainlessmusic.app.ui.common

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CutCornerShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.brainlessmusic.app.data.local.Skin
import com.brainlessmusic.app.ui.theme.LocalSkin
import com.brainlessmusic.app.ui.theme.RingFontFamily
import com.brainlessmusic.app.ui.theme.laneCut
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/** A short line for the user, shown for about [long] ? 3.5 s : 2 s. */
data class Notice(val text: String, val long: Boolean)

/**
 * The app's short messages ("Couldn't refresh", "Added to playlist"), posted from anywhere and shown by [NoticeHost].
 * They replaced `Toast` (owner, 2026-10-12): a system toast can't take a skin's look.
 */
object Notices {
    private val posted = MutableSharedFlow<Notice>(extraBufferCapacity = 8)
    val flow: SharedFlow<Notice> = posted.asSharedFlow()

    fun show(text: String, long: Boolean = false) {
        posted.tryEmit(Notice(text, long))
    }
}

/**
 * Shows [Notices] one at a time near the bottom, over the bars, in the skin's dress: Hit circle's outlined pill,
 * Lane's cut panel, Gear's chamfered plate, Ring's navy plate with the sky rim. Standard keeps the system toast, so it
 * looks as it always did. Never takes a touch.
 */
@Composable
fun NoticeHost() {
    val context = LocalContext.current
    val skin by rememberUpdatedState(LocalSkin.current)
    var shown by remember { mutableStateOf<Notice?>(null) }
    var visible by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        // Collected one by one, so notices queue instead of covering each other.
        Notices.flow.collect { notice ->
            if (skin == Skin.STANDARD) {
                Toast.makeText(context, notice.text, if (notice.long) Toast.LENGTH_LONG else Toast.LENGTH_SHORT).show()
                return@collect
            }
            shown = notice
            visible = true
            delay(if (notice.long) 3500 else 2000)
            visible = false
            delay(250)
        }
    }

    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
        AnimatedVisibility(
            visible = visible,
            enter = fadeIn() + slideInVertically { it / 2 },
            exit = fadeOut() + slideOutVertically { it / 2 },
            // Clear of the mini player and the tab bar.
            modifier = Modifier.windowInsetsPadding(WindowInsets.navigationBars).padding(bottom = 140.dp, start = 24.dp, end = 24.dp),
        ) {
            shown?.let { NoticePanel(it.text, skin) }
        }
    }
}

@Composable
private fun NoticePanel(text: String, skin: Skin) {
    val scheme = MaterialTheme.colorScheme
    val shape: Shape
    val color: Color
    val ink: Color
    val border: BorderStroke
    when (skin) {
        Skin.RING -> {
            shape = RoundedCornerShape(18.dp)
            color = RingInk
            ink = Color.White
            border = BorderStroke(3.dp, RingSky)
        }
        Skin.GEAR -> {
            shape = CutCornerShape(8.dp)
            color = scheme.surfaceContainerHigh
            ink = scheme.onSurface
            border = BorderStroke(2.dp, scheme.primary)
        }
        Skin.LANE -> {
            shape = laneCut(10.dp)
            color = scheme.surfaceContainerHigh
            ink = scheme.onSurface
            border = BorderStroke(1.dp, scheme.primary)
        }
        else -> {
            shape = RoundedCornerShape(50)
            color = scheme.surfaceContainerHigh
            ink = scheme.onSurface
            border = BorderStroke(1.dp, scheme.outline)
        }
    }
    Surface(shape = shape, color = color, border = border, modifier = Modifier.widthIn(max = 420.dp)) {
        Text(
            text,
            style = MaterialTheme.typography.bodyMedium,
            fontFamily = if (skin == Skin.RING) RingFontFamily else null,
            fontWeight = if (skin == Skin.RING) FontWeight.Bold else null,
            color = ink,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .padding(horizontal = 20.dp, vertical = 12.dp)
                .semantics { liveRegion = LiveRegionMode.Polite },
        )
    }
}
