package com.brainlessmusic.app.ui.splash

import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.brainlessmusic.app.data.local.Skin
import com.brainlessmusic.app.ui.theme.LocalSkin
import kotlinx.coroutines.launch

/** Part of [p] that falls between [from] and [to], as 0 to 1. */
private fun span(p: Float, from: Float, to: Float) = ((p - from) / (to - from)).coerceIn(0f, 1f)

/** What the reader says while it reads the card, in the skin's game's manner. */
private fun readingLabel(skin: Skin) = when (skin) {
    Skin.STANDARD -> "CARD READ"
    Skin.HIT_CIRCLE -> "PLAYER READY"
    Skin.LANE -> "SYNCHRONIZING"
}

/**
 * Signing in to an arcade machine (owner, 2026-10-11): after a sign-in, or when the app opens on a saved session, a
 * card slides into the reader, the reader reads it, and the screen says "Welcome back" with your name before the app
 * shows. Drawn in the skin's type, shapes and colours. About 2 s; a tap skips it; with animations off it never shows.
 */
@Composable
fun ArcadeWelcome(viewModel: StartViewModel) {
    val due by viewModel.welcome.collectAsStateWithLifecycle()
    val name by viewModel.displayName.collectAsStateWithLifecycle(initialValue = null)
    val context = LocalContext.current
    val animate = remember {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0f
    }
    val progress = remember { Animatable(1f) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(due) {
        if (!due) return@LaunchedEffect
        // Cleared first, so turning the phone mid-way doesn't play it again.
        viewModel.welcomed()
        if (!animate) return@LaunchedEffect
        progress.snapTo(0f)
        progress.animateTo(1f, tween(2100, easing = LinearEasing))
    }

    val p = progress.value
    if (p >= 1f) return

    val scheme = MaterialTheme.colorScheme
    val skin = LocalSkin.current
    // Up in the first tenth, down over the last fifth.
    val veil = span(p, 0f, 0.08f) * (1f - span(p, 0.82f, 1f))
    // The card slides into the reader, then the reader's light runs across it.
    val insert = span(p, 0.05f, 0.3f)
    val eased = 1f - (1f - insert) * (1f - insert)
    val read = span(p, 0.3f, 0.45f)
    val greet = span(p, 0.42f, 0.58f)

    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .fillMaxSize()
            .graphicsLayer { alpha = veil }
            .background(scheme.background)
            .pointerInput(Unit) { detectTapGestures { scope.launch { progress.snapTo(1f) } } },
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            // The reader: a slot, and the card dropping into it.
            Box(contentAlignment = Alignment.TopCenter, modifier = Modifier.size(width = 200.dp, height = 150.dp)) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .padding(top = 18.dp)
                        .graphicsLayer {
                            translationY = -(110.dp.toPx()) * (1f - eased)
                            alpha = insert
                        }
                        .size(width = 150.dp, height = 96.dp)
                        .background(scheme.primary, MaterialTheme.shapes.medium)
                        .border(2.dp, scheme.onBackground, MaterialTheme.shapes.medium),
                ) {
                    SkinMark(skin)
                }
                Canvas(Modifier.fillMaxWidth().height(150.dp)) {
                    val y = 18.dp.toPx()
                    // The slot's mouth, and its light sweeping once the card is in.
                    drawLine(scheme.onBackground, Offset(0f, y), Offset(size.width, y), 4.dp.toPx())
                    if (read > 0f && read < 1f) {
                        val x = size.width * read
                        drawLine(scheme.primary, Offset(x - 24.dp.toPx(), y), Offset(x + 24.dp.toPx(), y), 6.dp.toPx())
                    }
                }
            }
            Text(
                readingLabel(skin),
                style = MaterialTheme.typography.labelLarge,
                letterSpacing = 3.sp,
                color = scheme.primary,
                // Blinks while it reads, then holds.
                modifier = Modifier
                    .padding(top = 8.dp)
                    .graphicsLayer { alpha = if (read < 1f) (if ((p * 24).toInt() % 2 == 0) 1f else 0.35f) * insert else 1f },
            )
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.padding(top = 28.dp).graphicsLayer {
                    alpha = greet
                    translationY = 16.dp.toPx() * (1f - greet)
                },
            ) {
                Text("Welcome back", style = MaterialTheme.typography.titleMedium, color = scheme.onSurfaceVariant)
                Text(
                    name ?: "",
                    style = MaterialTheme.typography.displaySmall,
                    color = scheme.onBackground,
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(horizontal = 24.dp),
                )
                Box(
                    Modifier
                        .padding(top = 10.dp)
                        .width(160.dp * greet)
                        .height(3.dp)
                        .background(scheme.primary),
                )
            }
        }
    }
}

/** The skin's sign on the player card: a hit circle, Arcaea's diamond, or the plain card's stripe. */
@Composable
private fun SkinMark(skin: Skin) {
    val ink = MaterialTheme.colorScheme.onPrimary
    Canvas(Modifier.size(width = 120.dp, height = 60.dp)) {
        val c = Offset(size.width / 2, size.height / 2)
        when (skin) {
            Skin.STANDARD -> drawLine(ink, Offset(0f, c.y), Offset(size.width, c.y), 6.dp.toPx())
            Skin.HIT_CIRCLE -> drawCircle(ink, radius = 22.dp.toPx(), center = c, style = Stroke(5.dp.toPx()))
            Skin.LANE -> {
                val d = 20.dp.toPx()
                val path = androidx.compose.ui.graphics.Path().apply {
                    moveTo(c.x, c.y - d); lineTo(c.x + d, c.y); lineTo(c.x, c.y + d); lineTo(c.x - d, c.y); close()
                }
                drawPath(path, ink, style = Stroke(3.dp.toPx()))
            }
        }
    }
}
