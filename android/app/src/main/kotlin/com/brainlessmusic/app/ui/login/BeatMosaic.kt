package com.brainlessmusic.app.ui.login

import android.provider.Settings
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.LocalContext
import kotlin.math.ceil
import kotlin.math.pow

private const val COLS = 6

// The web title screen runs its wavefront at 0.4 s a beat (150 BPM). Here it is half that speed and
// only ever a soft pulse: on a phone held in the hand, a fast flash behind a form is tiring, not lively.
private const val BEAT_MS = 800

/**
 * The web title screen's backdrop: a grid of flat tiles in the theme's container colors, with a wavefront
 * that crosses it from the top-left once per beat and lights each tile toward the accent as it passes.
 * Colors come from [MaterialTheme.colorScheme], so it follows Material You and light/dark.
 *
 * Holds still when the system's animations are turned off.
 */
@Composable
fun BeatMosaic(modifier: Modifier = Modifier) {
    val scheme = MaterialTheme.colorScheme
    val context = LocalContext.current
    val animationsOn = remember {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0f
    }
    val beat = if (animationsOn) {
        rememberInfiniteTransition(label = "beat").animateFloat(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(tween(BEAT_MS, easing = LinearEasing)),
            label = "beat-phase",
        ).value
    } else {
        // Frozen just after a downbeat, so the still version still has some light in it.
        0.35f
    }

    val shades = listOf(scheme.primaryContainer, scheme.secondaryContainer, scheme.tertiaryContainer, scheme.surfaceContainerHigh)
    Canvas(modifier = modifier.fillMaxSize()) {
        val tile = size.width / COLS
        val rows = ceil(size.height / tile).toInt()
        for (row in 0 until rows) {
            for (col in 0 until COLS) {
                val i = row * COLS + col
                val base = when {
                    i % 7 == 0 -> shades[0]
                    i % 4 == 0 -> shades[1]
                    i % 5 == 0 -> shades[3]
                    else -> shades[2]
                }
                // 0 at the top-left corner, 1 at the bottom-right, as on the web.
                val wave = ((col.toFloat() / COLS) + (row.toFloat() / rows)) / 2f
                val sincePulse = ((beat - wave) % 1f + 1f) % 1f
                val glow = (1f - sincePulse).pow(4) * 0.55f
                drawRect(
                    color = lerp(base, scheme.primary, glow).copy(alpha = 0.55f),
                    topLeft = Offset(col * tile + 1f, row * tile + 1f),
                    size = Size(tile - 2f, tile - 2f),
                )
            }
        }
        // Settles the whole thing toward the ground so text on top never fights a bright tile.
        drawRect(scheme.background.copy(alpha = 0.55f), size = size)
    }
}
