package com.brainlessmusic.app.ui.login

import android.provider.Settings
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.brainlessmusic.app.data.local.Skin
import com.brainlessmusic.app.ui.common.GearCritical
import com.brainlessmusic.app.ui.common.GearLaserRight
import com.brainlessmusic.app.ui.common.RingSky
import com.brainlessmusic.app.ui.common.RingStar
import com.brainlessmusic.app.ui.common.RingYellow
import com.brainlessmusic.app.ui.common.starPath
import com.brainlessmusic.app.ui.theme.LocalSkin
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

/** A fixed moment, for when animations are off: something on screen, nothing moving. */
private const val STILL_AT = 1.3f

/**
 * Seconds of attract loop, advancing at [speed] (1 normal, lower when calm), so the pace can change without the
 * picture jumping. Held at [STILL_AT] with animations off.
 */
@Composable
private fun rememberClock(speed: Float): Float {
    val context = LocalContext.current
    val animationsOn = remember {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0f
    }
    var t by remember { mutableFloatStateOf(STILL_AT) }
    val pace by rememberUpdatedState(speed)
    if (animationsOn) {
        LaunchedEffect(Unit) {
            var last = withFrameNanos { it }
            while (true) {
                withFrameNanos { now ->
                    t += (now - last) / 1_000_000_000f * pace
                    last = now
                }
            }
        }
    }
    return t
}

/** The fractional part, always 0 to 1. */
private fun frac(x: Float) = x - floor(x)

/** A fixed pseudo-random 0 to 1 for item [i], so the scene is the same every time without storing it. */
private fun hash(i: Int, salt: Int = 0): Float = frac(sin((i * 12.9898f + salt * 78.233f)) * 43758.547f)

/**
 * The sign-in screen's backdrop (A143): Standard keeps the web title screen's beat mosaic; each game skin plays its
 * game's attract screen. [calm] once the form is up (A144): slower and dimmer, so typing isn't over a light show.
 * Flat shapes, no glow, like the rest of the skins.
 */
@Composable
fun TitleBackdrop(calm: Boolean) {
    val skin = LocalSkin.current
    if (skin == Skin.STANDARD) {
        BeatMosaic()
        return
    }
    val t = rememberClock(if (calm) 0.35f else 1f)
    val scheme = MaterialTheme.colorScheme
    Canvas(Modifier.fillMaxSize()) {
        drawRect(scheme.background)
        when (skin) {
            Skin.HIT_CIRCLE -> osuMenu(t, scheme.primary, scheme.onBackground)
            Skin.LANE -> arcaeaTitle(t, scheme.primary, scheme.onBackground)
            Skin.GEAR -> voltexAttract(t, scheme.primary, scheme.onBackground, scheme.surfaceContainerHigh, scheme.outline)
            else -> maimaiAttract(t, scheme.primary, scheme.surfaceContainer, scheme.outlineVariant)
        }
        // Settles it toward the ground so the band and the form always read over it.
        drawRect(scheme.background.copy(alpha = if (calm) 0.7f else 0.4f))
    }
}

/** osu!'s main menu: triangles drifting up behind the logo circle beating at 128 BPM, its visualiser round it. */
private fun DrawScope.osuMenu(t: Float, accent: androidx.compose.ui.graphics.Color, ink: androidx.compose.ui.graphics.Color) {
    val w = size.width
    val h = size.height
    for (i in 0 until 22) {
        val s = (18 + 46 * hash(i)).dp.toPx()
        val x = w * hash(i, 1)
        val speed = 30f + 50f * hash(i, 2)
        val y = h + s - frac((t * speed.dp.toPx() + hash(i, 3) * (h + 2 * s)) / (h + 2 * s)) * (h + 2 * s)
        val tri = Path().apply { moveTo(x, y - s / 2); lineTo(x + s / 2, y + s / 2); lineTo(x - s / 2, y + s / 2); close() }
        drawPath(tri, accent, alpha = 0.10f + 0.12f * hash(i, 4))
    }
    val beat = (1f - frac(t * 128f / 60f)).pow(3)
    val c = Offset(w / 2, h / 2)
    val r = min(w, h) * 0.34f * (1f + 0.035f * beat)
    for (n in 0 until 64) {
        val a = 2 * PI * n / 64
        val amp = abs(sin(n * 1.3 + t * 3.1)) * (0.35 + 0.65 * abs(sin(n * 0.29 + t * 1.7)))
        val len = 6.dp.toPx() + 26.dp.toPx() * amp.toFloat() * (0.5f + 0.5f * beat)
        val dir = Offset(sin(a).toFloat(), -cos(a).toFloat())
        drawLine(accent, c + dir * (r + 6.dp.toPx()), c + dir * (r + 6.dp.toPx() + len), 4.dp.toPx(), alpha = 0.6f)
    }
    drawCircle(accent, radius = r, center = c)
    drawCircle(ink, radius = r, center = c, style = Stroke(8.dp.toPx()))
}

/** Arcaea's title: light motes falling slowly, slanted rays crossing, a large outlined diamond turning. */
private fun DrawScope.arcaeaTitle(t: Float, accent: androidx.compose.ui.graphics.Color, ink: androidx.compose.ui.graphics.Color) {
    val w = size.width
    val h = size.height
    for (i in 0 until 3) {
        val x = frac(t * 0.03f + i / 3f) * (w + w) - w / 2
        val ray = Path().apply {
            moveTo(x, 0f); lineTo(x + w * 0.18f, 0f); lineTo(x + w * 0.18f - h * 0.35f, h); lineTo(x - h * 0.35f, h); close()
        }
        drawPath(ray, accent, alpha = 0.06f)
    }
    val c = Offset(w / 2, h / 2)
    val d = min(w, h) * 0.36f
    rotate(degrees = t * 6f, pivot = c) {
        val diamond = Path().apply { moveTo(c.x, c.y - d); lineTo(c.x + d, c.y); lineTo(c.x, c.y + d); lineTo(c.x - d, c.y); close() }
        drawPath(diamond, ink, alpha = 0.5f, style = Stroke(1.5.dp.toPx()))
        val inner = d * 0.8f
        val diamond2 = Path().apply { moveTo(c.x, c.y - inner); lineTo(c.x + inner, c.y); lineTo(c.x, c.y + inner); lineTo(c.x - inner, c.y); close() }
        drawPath(diamond2, accent, alpha = 0.6f, style = Stroke(1.dp.toPx()))
    }
    for (i in 0 until 46) {
        val speed = 14f + 22f * hash(i, 2)
        val y = frac((t * speed.dp.toPx()) / h + hash(i, 1)) * h
        val x = w * hash(i) + 10.dp.toPx() * sin(t * 0.6f + i).toFloat()
        val twinkle = 0.35f + 0.65f * abs(sin(t * (0.8f + hash(i, 3)) + i))
        drawCircle(if (i % 3 == 0) accent else ink, radius = (1.2f + 2f * hash(i, 4)).dp.toPx(), center = Offset(x, y), alpha = 0.55f * twinkle)
    }
}

/** SOUND VOLTEX's attract: the lane in perspective with chips coming down it, the two lasers swaying, the critical line. */
private fun DrawScope.voltexAttract(
    t: Float,
    accent: androidx.compose.ui.graphics.Color,
    ink: androidx.compose.ui.graphics.Color,
    lane: androidx.compose.ui.graphics.Color,
    divider: androidx.compose.ui.graphics.Color,
) {
    val w = size.width
    val h = size.height
    val topY = h * 0.1f
    val lineY = h * 0.86f
    val farW = w * 0.22f
    val nearW = w * 0.92f
    fun widthAt(k: Float) = farW + (nearW - farW) * k
    fun xAt(k: Float, across: Float) = w / 2 - widthAt(k) / 2 + widthAt(k) * across
    fun yAt(k: Float) = topY + (lineY - topY) * k
    val path = Path().apply {
        moveTo(xAt(0f, 0f), topY); lineTo(xAt(0f, 1f), topY); lineTo(xAt(1f, 1f), lineY); lineTo(xAt(1f, 0f), lineY); close()
    }
    drawPath(path, lane, alpha = 0.8f)
    for (k in 1..3) drawLine(divider, Offset(xAt(0f, k / 4f), topY), Offset(xAt(1f, k / 4f), lineY), 1.dp.toPx(), alpha = 0.6f)
    // Chips: one per lane, each on its own timing, sped up toward the line as perspective does.
    for (i in 0 until 8) {
        val col = i % 4
        val k = frac(t * 0.45f + hash(i)).pow(1.6f)
        val y = yAt(k)
        val x0 = xAt(k, col / 4f) + 3.dp.toPx()
        val x1 = xAt(k, (col + 1) / 4f) - 3.dp.toPx()
        drawLine(ink, Offset(x0, y), Offset(x1, y), (3f + 6f * k).dp.toPx(), alpha = 0.85f)
    }
    // The lasers sway across the lane, cyan left and magenta right.
    for ((side, color) in listOf(0 to accent, 1 to GearLaserRight)) {
        val laser = Path()
        for (s in 0..24) {
            val k = s / 24f
            val sway = 0.5f + 0.35f * sin(t * 1.4f + k * 3f + side * PI.toFloat())
            val across = if (side == 0) sway * 0.5f else 0.5f + sway * 0.5f
            val p = Offset(xAt(k, across), yAt(k))
            if (s == 0) laser.moveTo(p.x, p.y) else laser.lineTo(p.x, p.y)
        }
        drawPath(laser, color, alpha = 0.8f, style = Stroke(5.dp.toPx(), cap = StrokeCap.Round))
    }
    drawLine(GearCritical, Offset(xAt(1f, 0f), lineY), Offset(xAt(1f, 1f), lineY), 5.dp.toPx())
}

/** maimai's attract: the round screen, its eight buttons lighting one after another, the slide star orbiting. */
private fun DrawScope.maimaiAttract(
    t: Float,
    accent: androidx.compose.ui.graphics.Color,
    bezel: androidx.compose.ui.graphics.Color,
    rim: androidx.compose.ui.graphics.Color,
) {
    val w = size.width
    val h = size.height
    val c = Offset(w / 2, h / 2)
    val r = min(w, h) * 0.4f
    drawCircle(bezel, radius = r + 34.dp.toPx(), center = c)
    drawArc(RingSky, 0f, 360f, false, Offset(c.x - r, c.y - r), Size(r * 2, r * 2), style = Stroke(6.dp.toPx()))
    val colors = listOf(RingYellow, accent, RingSky, accent, RingSky, RingSky, accent, RingYellow)
    // A chase round the rim, a little over one button a beat, each fading after it lights.
    val head = t * 2.4f
    for (n in 0 until 8) {
        val a = Math.toRadians(22.5 + 45.0 * n)
        val at = Offset(c.x + r * sin(a).toFloat(), c.y - r * cos(a).toFloat())
        val since = frac((head - n) / 8f) * 8f
        val lit = (1f - since / 3f).coerceIn(0f, 1f)
        drawCircle(bezel, radius = 24.dp.toPx(), center = at)
        drawCircle(colors[n], radius = 24.dp.toPx(), center = at, style = Stroke(3.dp.toPx()))
        if (lit > 0f) drawCircle(colors[n], radius = 24.dp.toPx(), center = at, alpha = lit)
    }
    val turn = frac(t * 0.25f)
    drawArc(accent, -90f, 360f * turn, false, Offset(c.x - r, c.y - r), Size(r * 2, r * 2), style = Stroke(6.dp.toPx(), cap = StrokeCap.Round), alpha = 0.7f)
    val a = 2 * PI * turn
    drawPath(starPath(Offset(c.x + r * sin(a).toFloat(), c.y - r * cos(a).toFloat()), 14.dp.toPx()), RingStar)
    drawCircle(rim, radius = r - 30.dp.toPx(), center = c, style = Stroke(1.dp.toPx()))
}
