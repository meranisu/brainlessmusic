package com.brainlessmusic.app.ui.common

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.unit.dp
import com.brainlessmusic.app.data.local.Skin
import com.brainlessmusic.app.ui.theme.LocalSkin

// The small pieces every screen shares that change with the skin (A118). Standard draws exactly what it did before.

/** Whether the playing song in a list gets a [PlayingMarker]; Standard marks it with bold accent text only. */
val markPlaying: Boolean
    @Composable get() = LocalSkin.current != Skin.STANDARD

/** Hit circle's mark for the playing song in a list: a small hit circle. */
@Composable
fun PlayingMarker(modifier: Modifier = Modifier) {
    Box(modifier.size(16.dp).border(3.dp, MaterialTheme.colorScheme.primary, CircleShape))
}

/** The mini player's progress along its top edge: Material's thin line, or Hit circle's slider with its ball. */
@Composable
fun MiniProgress(progress: Float, modifier: Modifier = Modifier) {
    when (LocalSkin.current) {
        Skin.STANDARD -> LinearProgressIndicator(progress = { progress }, modifier = modifier.fillMaxWidth().height(2.dp))
        Skin.HIT_CIRCLE -> {
            val scheme = MaterialTheme.colorScheme
            Canvas(modifier.fillMaxWidth().height(8.dp).padding(horizontal = 4.dp)) {
                val cy = size.height / 2
                val stroke = 4.dp.toPx()
                val x = size.width * progress.coerceIn(0f, 1f)
                drawLine(scheme.surfaceContainerHighest, Offset(0f, cy), Offset(size.width, cy), stroke, StrokeCap.Round)
                drawLine(scheme.primary, Offset(0f, cy), Offset(x, cy), stroke, StrokeCap.Round)
                drawCircle(scheme.onSurface, radius = 4.dp.toPx(), center = Offset(x, cy))
            }
        }
    }
}

/** A bottom-bar icon: Hit circle rings the selected tab's, like a circle waiting to be hit. */
@Composable
fun TabIcon(selected: Boolean, content: @Composable () -> Unit) {
    if (selected && LocalSkin.current == Skin.HIT_CIRCLE) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier.size(34.dp).border(2.5.dp, MaterialTheme.colorScheme.primary, CircleShape),
        ) { content() }
    } else {
        content()
    }
}
