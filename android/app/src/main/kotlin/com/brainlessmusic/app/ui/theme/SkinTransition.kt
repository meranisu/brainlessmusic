package com.brainlessmusic.app.ui.theme

import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.text.TextStyle
import com.brainlessmusic.app.data.local.Skin
import com.brainlessmusic.app.ui.common.RingInk
import com.brainlessmusic.app.ui.common.RingSky
import com.brainlessmusic.app.ui.common.RingStar
import com.brainlessmusic.app.ui.common.RingYellow
import com.brainlessmusic.app.ui.common.starPath
import kotlinx.coroutines.launch

/** Part of [p] that falls between [from] and [to], as 0 to 1. */
private fun span(p: Float, from: Float, to: Float) = ((p - from) / (to - from)).coerceIn(0f, 1f)

/**
 * Plays when the skin changes (owner, 2026-10-11): its name with a moment from its game, over the app as it
 * restyles beneath. Standard fades its name in and out, Hit circle closes an approach ring on a circle that bursts,
 * Lane slams Arcaea's shutter and opens it, Gear runs SOUND VOLTEX's lane in to a critical line that slams across,
 * Ring lights maimai's eight buttons round the screen one by one as the slide star runs the ring.
 * About 1.4 s; a tap skips it; with animations off it never shows.
 */
@Composable
fun SkinTransition(skin: Skin) {
    val context = LocalContext.current
    val animate = remember {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0f
    }
    var shown by remember { mutableStateOf(skin) }
    val progress = remember { Animatable(1f) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(skin) {
        if (skin == shown) return@LaunchedEffect
        shown = skin
        if (!animate) return@LaunchedEffect
        progress.snapTo(0f)
        progress.animateTo(1f, tween(1400, easing = LinearEasing))
    }

    val p = progress.value
    if (p >= 1f) return

    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .fillMaxSize()
            // Takes every touch while it plays; a tap ends it.
            .pointerInput(Unit) { detectTapGestures { scope.launch { progress.snapTo(1f) } } },
    ) {
        when (skin) {
            Skin.STANDARD -> StandardIntro(p)
            Skin.HIT_CIRCLE -> HitCircleIntro(p)
            Skin.LANE -> LaneIntro(p)
            Skin.GEAR -> GearIntro(p)
            Skin.RING -> RingIntro(p)
        }
    }
}

/** In and out over the app: up in the first tenth, down over the last quarter. */
private fun veil(p: Float) = span(p, 0f, 0.1f) * (1f - span(p, 0.75f, 1f))

@Composable
private fun StandardIntro(p: Float) {
    val scheme = MaterialTheme.colorScheme
    val v = veil(p)
    Canvas(Modifier.fillMaxSize()) { drawRect(scheme.background, alpha = v) }
    Text(
        "Standard",
        style = MaterialTheme.typography.displaySmall,
        color = scheme.onBackground,
        modifier = Modifier.graphicsLayer {
            alpha = v
            val s = 0.94f + 0.06f * span(p, 0f, 0.4f)
            scaleX = s
            scaleY = s
        },
    )
}

@Composable
private fun HitCircleIntro(p: Float) {
    val scheme = MaterialTheme.colorScheme
    val v = veil(p)
    val approach = span(p, 0.05f, 0.5f)
    val burst = span(p, 0.5f, 0.75f)
    Canvas(Modifier.fillMaxSize()) {
        drawRect(scheme.background, alpha = v)
        val c = Offset(size.width / 2, size.height / 2 - 52.dp.toPx())
        val r = 56.dp.toPx()
        if (approach < 1f) {
            drawCircle(scheme.primary, radius = r * (3f - 2f * approach), center = c, alpha = v * (0.3f + 0.7f * approach), style = Stroke(4.dp.toPx()))
        }
        // The circle holds until the ring lands, then swells and fades as a hit.
        val s = 1f + 0.5f * burst
        val a = v * (1f - burst)
        drawCircle(scheme.primary, radius = r * s, center = c, alpha = a)
        drawCircle(scheme.onBackground, radius = r * s, center = c, alpha = a, style = Stroke(6.dp.toPx()))
    }
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.graphicsLayer { alpha = v }) {
        Text(
            "1",
            fontFamily = BrandFontFamily,
            fontWeight = FontWeight.Bold,
            fontSize = 44.sp,
            color = scheme.onPrimary,
            modifier = Modifier.padding(bottom = 64.dp).graphicsLayer { alpha = 1f - burst },
        )
        Text("Hit circle", fontFamily = BrandFontFamily, fontWeight = FontWeight.SemiBold, fontSize = 34.sp, color = scheme.onBackground)
    }
}

@Composable
private fun LaneIntro(p: Float) {
    val scheme = MaterialTheme.colorScheme
    // The shutter closes fast, holds, and opens: Arcaea's song-start screen.
    val shut = span(p, 0f, 0.22f) * (1f - span(p, 0.72f, 1f))
    val eased = 1f - (1f - shut) * (1f - shut)
    Canvas(Modifier.fillMaxSize()) {
        val w = size.width
        val h = size.height
        val slant = 40.dp.toPx()
        val travel = w / 2 + slant
        val leftX = -travel * (1f - eased)
        val rightX = travel * (1f - eased)
        val left = Path().apply {
            moveTo(leftX, 0f); lineTo(leftX + w / 2 + slant, 0f); lineTo(leftX + w / 2 - slant, h); lineTo(leftX, h); close()
        }
        val right = Path().apply {
            moveTo(rightX + w / 2 + slant, 0f); lineTo(rightX + w, 0f); lineTo(rightX + w, h); lineTo(rightX + w / 2 - slant, h); close()
        }
        drawPath(left, scheme.surfaceContainerHigh)
        drawPath(right, scheme.surfaceContainerHighest)
        // The seam: the accent edge on each panel, meeting in the middle.
        drawLine(scheme.primary, Offset(leftX + w / 2 + slant, 0f), Offset(leftX + w / 2 - slant, h), 3.dp.toPx())
        drawLine(scheme.primary, Offset(rightX + w / 2 + slant, 0f), Offset(rightX + w / 2 - slant, h), 3.dp.toPx())
        // The lock: a diamond on the seam once it closes.
        val d = 70.dp.toPx() * span(p, 0.18f, 0.3f)
        if (d > 0f && shut > 0.98f) {
            val c = Offset(w / 2, h / 2)
            val lock = Path().apply { moveTo(c.x, c.y - d); lineTo(c.x + d, c.y); lineTo(c.x, c.y + d); lineTo(c.x - d, c.y); close() }
            drawPath(lock, scheme.background)
            drawPath(lock, scheme.primary, style = Stroke(2.dp.toPx()))
        }
    }
    Text(
        "LANE",
        fontFamily = LaneFontFamily,
        fontWeight = FontWeight.Light,
        fontSize = 26.sp,
        letterSpacing = 4.sp,
        color = scheme.onBackground,
        modifier = Modifier.graphicsLayer { alpha = if (shut > 0.98f) span(p, 0.25f, 0.35f) else 0f },
    )
}

@Composable
private fun GearIntro(p: Float) {
    val scheme = MaterialTheme.colorScheme
    val v = veil(p)
    // The lane runs in from the horizon, then the critical line slams across it and the screen jolts once.
    val run = span(p, 0.04f, 0.4f)
    val ran = 1f - (1f - run) * (1f - run)
    val slam = span(p, 0.38f, 0.48f)
    val jolt = if (slam > 0f && slam < 1f) (1f - slam) * 10f * (if ((p * 60).toInt() % 2 == 0) 1f else -1f) else 0f
    val laserRight = Color(0xFFFF2FD0)
    val critical = Color(0xFFFF3355)
    Canvas(Modifier.fillMaxSize().graphicsLayer { translationX = jolt.dp.toPx() }) {
        drawRect(scheme.background, alpha = v)
        val w = size.width
        val h = size.height
        val lineY = h * 0.62f
        val topY = lineY - (lineY - h * 0.12f) * ran
        val nearW = w * 0.86f
        // The far end narrows as the lane stretches away.
        val farW = nearW * (1f - 0.76f * ran)
        val lane = Path().apply {
            moveTo(w / 2 - farW / 2, topY); lineTo(w / 2 + farW / 2, topY)
            lineTo(w / 2 + nearW / 2, lineY + h * 0.2f); lineTo(w / 2 - nearW / 2, lineY + h * 0.2f); close()
        }
        drawPath(lane, scheme.surfaceContainerHigh, alpha = v)
        for (k in 1..3) {
            val a = k / 4f
            drawLine(
                scheme.outline,
                Offset(w / 2 - farW / 2 + farW * a, topY),
                Offset(w / 2 - nearW / 2 + nearW * a, lineY + h * 0.2f),
                1.dp.toPx(),
                alpha = v * 0.6f,
            )
        }
        drawLine(scheme.primary, Offset(w / 2 - farW / 2, topY), Offset(w / 2 - nearW / 2, lineY + h * 0.2f), 3.dp.toPx(), alpha = v)
        drawLine(laserRight, Offset(w / 2 + farW / 2, topY), Offset(w / 2 + nearW / 2, lineY + h * 0.2f), 3.dp.toPx(), alpha = v)
        if (slam > 0f) {
            val half = (w / 2) * slam
            drawLine(critical, Offset(w / 2 - half, lineY), Offset(w / 2 + half, lineY), 5.dp.toPx(), alpha = v)
            // The two knob cursors ride in along the line.
            val c = 12.dp.toPx()
            val lx = w * 0.18f * slam + (1f - slam) * -c
            val rx = w - w * 0.18f * slam + (1f - slam) * c
            drawPath(Path().apply { moveTo(lx, lineY - c); lineTo(lx + c, lineY + c * 0.4f); lineTo(lx - c, lineY + c * 0.4f); close() }, scheme.primary, alpha = v)
            drawPath(Path().apply { moveTo(rx, lineY - c); lineTo(rx + c, lineY + c * 0.4f); lineTo(rx - c, lineY + c * 0.4f); close() }, laserRight, alpha = v)
        }
    }
    Text(
        "GEAR",
        fontFamily = GearDisplayFontFamily,
        fontWeight = FontWeight.Black,
        fontSize = 40.sp,
        letterSpacing = 4.sp,
        color = scheme.onBackground,
        modifier = Modifier.padding(bottom = 140.dp).graphicsLayer {
            alpha = v * span(p, 0.45f, 0.55f)
            val s = 1.25f - 0.25f * span(p, 0.45f, 0.55f)
            scaleX = s
            scaleY = s
            translationX = jolt.dp.toPx()
        },
    )
}

@Composable
private fun RingIntro(p: Float) {
    val scheme = MaterialTheme.colorScheme
    val v = veil(p)
    // The screen's ring draws in, its eight buttons light clockwise from the top right, and the slide star runs the
    // ring once behind them.
    val open = span(p, 0.03f, 0.25f)
    val run = span(p, 0.2f, 0.62f)
    val colors = listOf(RingYellow, scheme.primary, RingSky, scheme.primary, RingSky, RingSky, scheme.primary, RingYellow)
    Canvas(Modifier.fillMaxSize()) {
        drawRect(scheme.background, alpha = v)
        val c = Offset(size.width / 2, size.height * 0.42f)
        val r = size.width * 0.38f * (0.85f + 0.15f * open)
        drawCircle(scheme.surfaceContainer, radius = r + 30.dp.toPx(), center = c, alpha = v * open)
        drawArc(
            scheme.outlineVariant, 0f, 360f, false, Offset(c.x - r, c.y - r), Size(r * 2, r * 2),
            style = Stroke(6.dp.toPx()), alpha = v * open,
        )
        if (run > 0f) {
            drawArc(
                scheme.primary, -90f, 360f * run, false, Offset(c.x - r, c.y - r), Size(r * 2, r * 2),
                style = Stroke(6.dp.toPx(), cap = StrokeCap.Round), alpha = v,
            )
            val a = 2 * Math.PI * run
            drawPath(starPath(Offset(c.x + r * kotlin.math.sin(a).toFloat(), c.y - r * kotlin.math.cos(a).toFloat()), 14.dp.toPx()), RingStar, alpha = v)
        }
        for (n in 0 until 8) {
            val a = Math.toRadians(22.5 + 45.0 * n)
            val at = Offset(c.x + r * kotlin.math.sin(a).toFloat(), c.y - r * kotlin.math.cos(a).toFloat())
            val lit = span(p, 0.22f + 0.05f * n, 0.27f + 0.05f * n)
            drawCircle(scheme.surfaceContainer, radius = 22.dp.toPx(), center = at, alpha = v * open)
            drawCircle(colors[n], radius = 22.dp.toPx(), center = at, style = Stroke(3.dp.toPx()), alpha = v * open)
            if (lit > 0f) drawCircle(colors[n], radius = 22.dp.toPx() * lit, center = at, alpha = v)
        }
    }
    val shown = span(p, 0.6f, 0.7f)
    Box(Modifier.padding(bottom = 120.dp).graphicsLayer {
        alpha = v * shown
        val s = 1.3f - 0.3f * shown
        scaleX = s
        scaleY = s
    }) {
        val style = TextStyle(fontFamily = RingFontFamily, fontWeight = FontWeight.ExtraBold, fontSize = 48.sp, letterSpacing = 3.sp)
        Text("RING", style = style.copy(color = RingInk, drawStyle = Stroke(width = 10f)))
        Text("RING", style = style.copy(color = RingYellow))
    }
}
