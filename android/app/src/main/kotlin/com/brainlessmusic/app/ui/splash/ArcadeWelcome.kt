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
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.brainlessmusic.app.data.local.Skin
import com.brainlessmusic.app.ui.common.GearCritical
import com.brainlessmusic.app.ui.common.GearInk
import com.brainlessmusic.app.ui.common.GearLaserRight
import com.brainlessmusic.app.ui.common.RingInk
import com.brainlessmusic.app.ui.common.RingSky
import com.brainlessmusic.app.ui.common.RingStar
import com.brainlessmusic.app.ui.common.RingYellow
import com.brainlessmusic.app.ui.common.starPath
import com.brainlessmusic.app.ui.theme.BrandFontFamily
import com.brainlessmusic.app.ui.theme.GearDisplayFontFamily
import com.brainlessmusic.app.ui.theme.LocalSkin
import com.brainlessmusic.app.ui.theme.RingFontFamily
import com.brainlessmusic.app.ui.theme.SlantShape
import com.brainlessmusic.app.ui.theme.drawShutter
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin
import kotlinx.coroutines.launch

/** Part of [p] that falls between [from] and [to], as 0 to 1. */
private fun span(p: Float, from: Float, to: Float) = ((p - from) / (to - from)).coerceIn(0f, 1f)

private fun easeOut(t: Float) = 1f - (1f - t) * (1f - t)

/** Runs a little past 1 and settles back: maimai's bounce. */
private fun overshoot(t: Float): Float {
    val u = t - 1f
    return 1f + 2.70158f * u * u * u + 1.70158f * u * u
}

/** Up in the first tenth, down over the last fifth. */
private fun veil(p: Float) = span(p, 0f, 0.08f) * (1f - span(p, 0.82f, 1f))

/** The name's first letter, for the square a game shows beside a player's name. */
private fun initial(name: String) = name.trim().firstOrNull()?.uppercaseChar()?.toString() ?: ""

/**
 * Signing in to an arcade machine (owner, 2026-10-11): after a sign-in, or when the app opens on a saved session, the
 * skin's game greets you by name before the app shows. Standard drops a card into a reader; Hit circle unfolds osu!'s
 * "welcome" in a disc ringed by its visualiser and beats twice; Lane opens the app from behind Arcaea's shutter;
 * Gear runs SOUND VOLTEX's entry (lasers, ENTRY, your appeal card, the critical line and GAME START); Ring pops
 * maimai's round screen open and drops your name plate in. About 2 s; a tap skips it; with animations off it never
 * shows.
 */
@Composable
fun ArcadeWelcome(viewModel: StartViewModel) {
    val name by viewModel.displayName.collectAsStateWithLifecycle(initialValue = null)
    val context = LocalContext.current
    val animate = remember {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0f
    }
    val progress = remember { Animatable(1f) }
    val scope = rememberCoroutineScope()

    // Watched from one long-lived effect rather than keyed on the flag: clearing the flag would change the key and
    // cancel the effect, and with it the animation, on its first frame, leaving an invisible layer over the app.
    LaunchedEffect(Unit) {
        viewModel.welcome.collect { due ->
            if (!due) return@collect
            // Cleared first, so turning the phone mid-way doesn't play it again.
            viewModel.welcomed()
            if (!animate) return@collect
            progress.snapTo(0f)
            progress.animateTo(1f, tween(2100, easing = LinearEasing))
        }
    }

    val p = progress.value
    if (p >= 1f) return

    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .fillMaxSize()
            .pointerInput(Unit) { detectTapGestures { scope.launch { progress.snapTo(1f) } } },
    ) {
        when (LocalSkin.current) {
            Skin.STANDARD -> CardReaderWelcome(p, name.orEmpty())
            Skin.HIT_CIRCLE -> HitCircleWelcome(p, name.orEmpty())
            Skin.LANE -> LaneWelcome(p, name.orEmpty())
            Skin.GEAR -> GearWelcome(p, name.orEmpty())
            Skin.RING -> RingWelcome(p, name.orEmpty())
        }
    }
}

/** A card slides into the reader, the reader's light runs across it, then "Welcome back" and the name. */
@Composable
private fun CardReaderWelcome(p: Float, name: String) {
    val scheme = MaterialTheme.colorScheme
    val insert = span(p, 0.05f, 0.3f)
    val eased = easeOut(insert)
    val read = span(p, 0.3f, 0.45f)
    val greet = span(p, 0.42f, 0.58f)

    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier.fillMaxSize().graphicsLayer { alpha = veil(p) }.background(scheme.background),
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
                    val ink = scheme.onPrimary
                    Canvas(Modifier.size(width = 120.dp, height = 60.dp)) {
                        drawLine(ink, Offset(0f, size.height / 2), Offset(size.width, size.height / 2), 6.dp.toPx())
                    }
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
                "CARD READ",
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
                    name,
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

/** Where the Hit circle welcome's disc sits: a little above the middle, leaving room for the name under it. */
private val HitDiscRise = 40.dp

/** The two beats the disc lands on once "welcome" has unfolded, as osu!'s logo pulses to its intro. */
private val HitBeats = listOf(0.5f, 0.66f)

/**
 * osu!lazer's "Welcome" intro: the word unfolds from a thin line in a dark disc ringed by the audio visualiser, the
 * whole thing easing up from 90% scale; then the disc beats twice, throwing a ring off each beat, and the name shows.
 */
@Composable
private fun HitCircleWelcome(p: Float, name: String) {
    val scheme = MaterialTheme.colorScheme
    // osu! unfolds the word over its first 400 ms.
    val unfold = easeOut(span(p, 0f, 0.19f))
    val grow = 0.9f + 0.1f * easeOut(span(p, 0f, 0.8f))
    val beat = HitBeats.maxOf { at -> if (p < at) 0f else (1f - (p - at) / 0.1f).coerceAtLeast(0f) }
    val shown = span(p, 0.5f, 0.62f)

    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier.fillMaxSize().graphicsLayer { alpha = veil(p) }.background(scheme.background),
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val c = Offset(size.width / 2, size.height / 2 - HitDiscRise.toPx())
            val r = 92.dp.toPx() * grow * (1f + 0.06f * beat)
            // The visualiser: bars round the disc, loud at first and dying away like the intro's piano.
            val decay = 1f - span(p, 0.15f, 0.8f)
            for (n in 0 until 60) {
                val a = 2 * PI * n / 60
                val amp = abs(sin(n * 1.7 + p * 21)) * (0.4 + 0.6 * abs(sin(n * 0.37 + p * 9)))
                val len = 6.dp.toPx() + 34.dp.toPx() * amp.toFloat() * decay + 12.dp.toPx() * beat
                val dir = Offset(sin(a).toFloat(), -cos(a).toFloat())
                val from = r + 6.dp.toPx()
                drawLine(scheme.primary, c + dir * from, c + dir * (from + len), 4.dp.toPx(), alpha = 0.75f)
            }
            drawCircle(scheme.surfaceContainerHigh, radius = r, center = c)
            drawCircle(scheme.onBackground, radius = r, center = c, style = Stroke(5.dp.toPx()))
            for (at in HitBeats) {
                val t = span(p, at, at + 0.14f)
                if (t > 0f && t < 1f) {
                    drawCircle(scheme.primary, radius = r * (1f + 0.45f * t), center = c, alpha = 1f - t, style = Stroke(3.dp.toPx()))
                }
            }
        }
        Text(
            "welcome",
            fontFamily = BrandFontFamily,
            fontWeight = FontWeight.SemiBold,
            fontSize = 38.sp,
            color = scheme.onBackground,
            modifier = Modifier.offset(y = -HitDiscRise).graphicsLayer {
                val s = grow * (1f + 0.06f * beat)
                scaleX = s
                scaleY = s * unfold
            },
        )
        Text(
            name,
            fontFamily = BrandFontFamily,
            fontWeight = FontWeight.SemiBold,
            fontSize = 30.sp,
            color = scheme.onBackground,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier
                .offset(y = 112.dp)
                .padding(horizontal = 24.dp)
                .graphicsLayer {
                    alpha = shown
                    translationY = 14.dp.toPx() * (1f - shown)
                },
        )
    }
}

/**
 * The app opens from behind Arcaea's shutter: it starts shut, the lock's diamond draws on the seam, a slanted plate
 * slides along it with your name while "SYNCHRONIZING" turns to "WELCOME BACK", and the shutter parts onto the app.
 */
@Composable
private fun LaneWelcome(p: Float, name: String) {
    val scheme = MaterialTheme.colorScheme
    // Fades up quickly over the system splash, already shut.
    val shown = span(p, 0f, 0.05f)
    val open = span(p, 0.72f, 1f)
    // Slow to start, then flung apart.
    val closed = 1f - open * open
    val content = 1f - span(p, 0.64f, 0.72f)
    val lock = easeOut(span(p, 0.06f, 0.2f))
    val synced = span(p, 0.4f, 0.42f) >= 1f
    val plate = easeOut(span(p, 0.2f, 0.4f))

    Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize().graphicsLayer { alpha = shown }) {
        Canvas(Modifier.fillMaxSize()) {
            drawShutter(closed, scheme.surfaceContainerHigh, scheme.surfaceContainerHighest, scheme.primary)
            val d = 56.dp.toPx() * lock
            if (d > 0f && content > 0f) {
                val c = Offset(size.width / 2, size.height / 2 - 96.dp.toPx())
                val outer = Path().apply { moveTo(c.x, c.y - d); lineTo(c.x + d, c.y); lineTo(c.x, c.y + d); lineTo(c.x - d, c.y); close() }
                drawPath(outer, scheme.background, alpha = content)
                drawPath(outer, scheme.primary, alpha = content, style = Stroke(2.dp.toPx()))
                // A smaller diamond fills in once the read is done.
                if (synced) {
                    val k = d * 0.42f
                    val inner = Path().apply { moveTo(c.x, c.y - k); lineTo(c.x + k, c.y); lineTo(c.x, c.y + k); lineTo(c.x - k, c.y); close() }
                    drawPath(inner, scheme.primary, alpha = content)
                }
            }
        }
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .padding(horizontal = 32.dp)
                .graphicsLayer {
                    alpha = plate * content
                    translationX = -64.dp.toPx() * (1f - plate)
                }
                .background(scheme.background, SlantShape(16.dp))
                .border(1.5.dp, scheme.primary, SlantShape(16.dp))
                .padding(horizontal = 40.dp, vertical = 14.dp),
        ) {
            Text(
                if (synced) "WELCOME BACK" else "SYNCHRONIZING",
                style = MaterialTheme.typography.labelLarge,
                letterSpacing = 3.sp,
                color = scheme.primary,
                modifier = Modifier.graphicsLayer { alpha = if (synced || (p * 24).toInt() % 2 == 0) 1f else 0.35f },
            )
            Text(
                name,
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Light,
                color = scheme.onBackground,
                textAlign = TextAlign.Center,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/**
 * SOUND VOLTEX's entry: the two lasers run down from the top corners, ENTRY stamps in with a jolt, your appeal card
 * slides in from the right, and the critical line slams across with its knob cursors and a blinking GAME START.
 */
@Composable
private fun GearWelcome(p: Float, name: String) {
    val scheme = MaterialTheme.colorScheme
    val run = easeOut(span(p, 0.03f, 0.25f))
    val stamp = span(p, 0.16f, 0.24f)
    val card = easeOut(span(p, 0.3f, 0.46f))
    val slam = span(p, 0.54f, 0.61f)
    val shake = if ((p * 60).toInt() % 2 == 0) 1f else -1f
    val jolt = when {
        stamp > 0f && stamp < 1f -> (1f - stamp) * 8f * shake
        slam > 0f && slam < 1f -> (1f - slam) * 10f * shake
        else -> 0f
    }

    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .fillMaxSize()
            .graphicsLayer {
                alpha = veil(p)
                translationX = jolt.dp.toPx()
            }
            .background(scheme.background),
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val w = size.width
            val reach = size.height * 0.56f * run
            val wide = 10.dp.toPx()
            drawLine(scheme.primary, Offset(w * 0.06f, 0f), Offset(w * 0.06f + w * 0.18f * run, reach), wide, alpha = 0.85f)
            drawLine(GearLaserRight, Offset(w * 0.94f, 0f), Offset(w * 0.94f - w * 0.18f * run, reach), wide, alpha = 0.85f)
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                "ENTRY",
                fontFamily = GearDisplayFontFamily,
                fontWeight = FontWeight.Black,
                fontSize = 44.sp,
                letterSpacing = 6.sp,
                color = scheme.onBackground,
                modifier = Modifier.graphicsLayer {
                    alpha = stamp
                    val s = 1.4f - 0.4f * stamp
                    scaleX = s
                    scaleY = s
                },
            )
            Spacer(Modifier.height(28.dp))
            // The appeal card: your mark beside your name, on a chamfered panel.
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .padding(horizontal = 32.dp)
                    .widthIn(max = 340.dp)
                    .fillMaxWidth()
                    .graphicsLayer {
                        alpha = span(p, 0.3f, 0.35f)
                        translationX = 360.dp.toPx() * (1f - card)
                    }
                    .background(scheme.surfaceContainerHigh, MaterialTheme.shapes.large)
                    .border(2.dp, scheme.primary, MaterialTheme.shapes.large)
                    .padding(12.dp),
            ) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier.size(64.dp).background(scheme.primary, MaterialTheme.shapes.medium),
                ) {
                    Text(initial(name), fontFamily = GearDisplayFontFamily, fontWeight = FontWeight.Black, fontSize = 28.sp, color = GearInk)
                }
                Column(Modifier.padding(start = 14.dp)) {
                    Text(
                        "WELCOME BACK",
                        fontFamily = GearDisplayFontFamily,
                        fontWeight = FontWeight.Bold,
                        fontSize = 11.sp,
                        letterSpacing = 2.sp,
                        color = scheme.primary,
                    )
                    Text(
                        name,
                        style = MaterialTheme.typography.titleLarge,
                        color = scheme.onBackground,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Spacer(Modifier.height(28.dp))
            Canvas(Modifier.fillMaxWidth().height(28.dp)) {
                if (slam <= 0f) return@Canvas
                val y = size.height / 2
                val w = size.width
                val half = w / 2 * slam
                drawLine(GearCritical, Offset(w / 2 - half, y), Offset(w / 2 + half, y), 5.dp.toPx())
                // The two knob cursors ride in along the line.
                val c = 12.dp.toPx()
                val lx = w * 0.18f * slam + (1f - slam) * -c
                val rx = w - w * 0.18f * slam + (1f - slam) * c
                drawPath(Path().apply { moveTo(lx, y - c); lineTo(lx + c, y + c * 0.4f); lineTo(lx - c, y + c * 0.4f); close() }, scheme.primary)
                drawPath(Path().apply { moveTo(rx, y - c); lineTo(rx + c, y + c * 0.4f); lineTo(rx - c, y + c * 0.4f); close() }, GearLaserRight)
            }
            Text(
                "GAME START",
                fontFamily = GearDisplayFontFamily,
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp,
                letterSpacing = 4.sp,
                color = GearCritical,
                modifier = Modifier.padding(top = 6.dp).graphicsLayer {
                    alpha = if (slam < 1f) 0f else if ((p * 20).toInt() % 2 == 0) 1f else 0.4f
                },
            )
        }
    }
}

/**
 * maimai's sign-in: the round screen pops open, the slide star runs its ring once, "Welcome!" bounces in, and your
 * name plate drops into the middle: the icon square and the name on its white strip.
 */
@Composable
private fun RingWelcome(p: Float, name: String) {
    val scheme = MaterialTheme.colorScheme
    val open = overshoot(span(p, 0.02f, 0.2f))
    val run = span(p, 0.1f, 0.6f)
    val hello = overshoot(span(p, 0.18f, 0.32f))
    val plate = overshoot(span(p, 0.36f, 0.52f))

    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier.fillMaxSize().graphicsLayer { alpha = veil(p) }.background(scheme.background),
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val c = Offset(size.width / 2, size.height / 2)
            val r = min(size.width, size.height) * 0.42f * open
            if (r <= 0f) return@Canvas
            drawCircle(scheme.surfaceContainer, radius = r, center = c)
            drawCircle(RingSky, radius = r, center = c, style = Stroke(6.dp.toPx()))
            if (run > 0f) {
                drawArc(
                    scheme.primary, -90f, 360f * run, false, Offset(c.x - r, c.y - r), Size(r * 2, r * 2),
                    style = Stroke(6.dp.toPx(), cap = StrokeCap.Round),
                )
                val a = 2 * PI * run
                drawPath(starPath(Offset(c.x + r * sin(a).toFloat(), c.y - r * cos(a).toFloat()), 14.dp.toPx()), RingStar)
            }
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(Modifier.graphicsLayer {
                alpha = span(p, 0.18f, 0.22f)
                scaleX = hello
                scaleY = hello
            }) {
                val style = TextStyle(fontFamily = RingFontFamily, fontWeight = FontWeight.ExtraBold, fontSize = 40.sp, letterSpacing = 1.sp)
                Text("Welcome!", style = style.copy(color = RingInk, drawStyle = Stroke(width = 10f)))
                Text("Welcome!", style = style.copy(color = RingYellow))
            }
            Spacer(Modifier.height(20.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .padding(horizontal = 32.dp)
                    .widthIn(max = 300.dp)
                    .fillMaxWidth()
                    .graphicsLayer {
                        alpha = span(p, 0.36f, 0.4f)
                        translationY = -56.dp.toPx() * (1f - plate)
                    }
                    .background(RingSky, RoundedCornerShape(18.dp))
                    .border(3.dp, RingInk, RoundedCornerShape(18.dp))
                    .padding(8.dp),
            ) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier.size(52.dp).background(RingYellow, RoundedCornerShape(12.dp)),
                ) {
                    Text(initial(name), fontFamily = RingFontFamily, fontWeight = FontWeight.ExtraBold, fontSize = 26.sp, color = RingInk)
                }
                Box(
                    contentAlignment = Alignment.CenterStart,
                    modifier = Modifier
                        .padding(start = 8.dp)
                        .weight(1f)
                        .height(52.dp)
                        .background(Color.White, RoundedCornerShape(12.dp))
                        .padding(horizontal = 12.dp),
                ) {
                    Text(
                        name,
                        fontFamily = RingFontFamily,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 18.sp,
                        color = RingInk,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}
