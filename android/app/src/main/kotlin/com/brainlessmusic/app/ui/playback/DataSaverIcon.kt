package com.brainlessmusic.app.ui.playback

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import com.brainlessmusic.app.ui.playback.skins.rememberAnimationsOn
import com.brainlessmusic.app.ui.theme.AppIcons
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

/**
 * The player's data saver toggle. Turning it on squeezes the icon flat and wide, then lets it spring back: the stream
 * just got smaller. Turning it off stretches it tall instead. One shot per tap, so the change is confirmed where the
 * finger is; nothing moves on first show or with animations off.
 */
@Composable
fun DataSaverIcon(on: Boolean, modifier: Modifier = Modifier) {
    val animate = rememberAnimationsOn()
    val squashX = remember { Animatable(1f) }
    val squashY = remember { Animatable(1f) }
    val shown = remember { BooleanArray(1) }
    // The button's colour fades with the squeeze instead of flipping on the first frame.
    val tint by animateColorAsState(LocalContentColor.current, tween(if (animate) 220 else 0), label = "dataSaverTint")

    LaunchedEffect(on) {
        if (!shown[0] || !animate) {
            shown[0] = true
            return@LaunchedEffect
        }
        // On: flat and wide. Off: tall and narrow. Both settle back with the same light bounce.
        squashX.snapTo(if (on) 1.25f else 0.8f)
        squashY.snapTo(if (on) 0.55f else 1.25f)
        val back = spring<Float>(dampingRatio = 0.38f, stiffness = Spring.StiffnessMedium)
        coroutineScope {
            launch { squashX.animateTo(1f, back) }
            launch { squashY.animateTo(1f, back) }
        }
    }

    Icon(
        if (on) AppIcons.dataSaverOn else AppIcons.dataSaverOff,
        contentDescription = if (on) "Data saver on" else "Data saver off",
        tint = tint,
        modifier = modifier.graphicsLayer {
            scaleX = squashX.value
            scaleY = squashY.value
        },
    )
}
