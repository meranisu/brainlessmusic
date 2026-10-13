package com.brainlessmusic.app.ui.splash

import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
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
import androidx.compose.foundation.shape.RoundedCornerShape
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
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.launch
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.runtime.mutableIntStateOf

/** Asks [ArcadeGoodbye] to play; posted by sign-out with the name to say goodbye to, read before it is cleared. */
object Goodbye {
    internal val requests = MutableSharedFlow<String>(extraBufferCapacity = 1)

    fun play(name: String) {
        requests.tryEmit(name)
    }
}

/** Up quickly, so it covers the screen before the app moves to sign-in; down over the last sixth onto that screen. */
private fun goodbyeVeil(p: Float) = span(p, 0f, 0.06f) * (1f - span(p, 0.84f, 1f))

/**
 * Signing out (A138): each skin's welcome in reverse, over the move to the sign-in screen, which shows as it ends.
 * Standard's card leaves the reader; Hit circle's disc says "see you next time" and folds away; Lane's shutter
 * closes on the app and opens on sign-in; Gear's appeal card slides out, the critical line drops and it thanks you
 * for playing; Ring's name plate lifts off and the round screen shrinks shut. About 1.6 s; a tap skips it; with
 * animations off it never shows.
 */
@Composable
fun ArcadeGoodbye() {
    val context = LocalContext.current
    val animate = remember {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0f
    }
    val progress = remember { Animatable(1f) }
    var name by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        Goodbye.requests.collect { who ->
            if (!animate) return@collect
            name = who
            progress.snapTo(0f)
            progress.animateTo(1f, tween(1600, easing = LinearEasing))
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
            Skin.STANDARD -> CardReaderGoodbye(p, name)
            Skin.HIT_CIRCLE -> HitCircleGoodbye(p, name)
            Skin.LANE -> LaneGoodbye(p, name)
            Skin.GEAR -> GearGoodbye(p, name)
            Skin.RING -> RingGoodbye(p, name)
        }
    }
}

/** The reader's light runs back across the card, the card rises out of the slot, and "See you" stays a moment. */
@Composable
private fun CardReaderGoodbye(p: Float, name: String) {
    val scheme = MaterialTheme.colorScheme
    val read = span(p, 0.06f, 0.2f)
    val out = span(p, 0.2f, 0.48f)
    // Slow to leave, then pulled clear.
    val lifted = out * out

    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier.fillMaxSize().graphicsLayer { alpha = goodbyeVeil(p) }.background(scheme.background),
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(contentAlignment = Alignment.TopCenter, modifier = Modifier.size(width = 200.dp, height = 150.dp)) {
                Box(
                    modifier = Modifier
                        .padding(top = 18.dp)
                        .graphicsLayer {
                            translationY = -(110.dp.toPx()) * lifted
                            alpha = 1f - out
                        }
                        .size(width = 150.dp, height = 96.dp)
                        .background(scheme.primary, MaterialTheme.shapes.medium)
                        .border(2.dp, scheme.onBackground, MaterialTheme.shapes.medium),
                ) {
                    val ink = scheme.onPrimary
                    Canvas(Modifier.fillMaxSize().padding(horizontal = 15.dp)) {
                        drawLine(ink, Offset(0f, size.height / 2), Offset(size.width, size.height / 2), 6.dp.toPx())
                    }
                }
                Canvas(Modifier.fillMaxWidth().height(150.dp)) {
                    val y = 18.dp.toPx()
                    drawLine(scheme.onBackground, Offset(0f, y), Offset(size.width, y), 4.dp.toPx())
                    // The light runs right to left this time.
                    if (read > 0f && read < 1f) {
                        val x = size.width * (1f - read)
                        drawLine(scheme.primary, Offset(x - 24.dp.toPx(), y), Offset(x + 24.dp.toPx(), y), 6.dp.toPx())
                    }
                }
            }
            Text("CARD OUT", style = MaterialTheme.typography.labelLarge, letterSpacing = 3.sp, color = scheme.primary, modifier = Modifier.padding(top = 8.dp))
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(top = 28.dp)) {
                Text("See you", style = MaterialTheme.typography.titleMedium, color = scheme.onSurfaceVariant)
                Text(
                    name,
                    style = MaterialTheme.typography.displaySmall,
                    color = scheme.onBackground,
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(horizontal = 24.dp),
                )
                // The underline the welcome drew, drawn back in.
                Box(Modifier.padding(top = 10.dp).size(width = 160.dp * (1f - span(p, 0.3f, 0.6f)), height = 3.dp).background(scheme.primary))
            }
        }
    }
}

/**
 * osu!'s goodbye: the disc reads "see you next time" with the visualiser quietening round it, the name under it goes
 * first, then the words fold back to a thin line and the disc shrinks away.
 */
@Composable
private fun HitCircleGoodbye(p: Float, name: String) {
    val scheme = MaterialTheme.colorScheme
    val fold = span(p, 0.5f, 0.66f)
    val shrink = span(p, 0.62f, 0.84f)
    val gone = shrink * shrink
    val nameOut = span(p, 0.42f, 0.54f)

    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier.fillMaxSize().graphicsLayer { alpha = goodbyeVeil(p) }.background(scheme.background),
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val c = Offset(size.width / 2, size.height / 2 - 40.dp.toPx())
            val r = 92.dp.toPx() * (1f - gone)
            if (r <= 0f) return@Canvas
            // The visualiser, dying down from the start.
            val level = 1f - span(p, 0f, 0.6f)
            for (n in 0 until 60) {
                val a = 2 * PI * n / 60
                val amp = abs(sin(n * 1.7 + p * 21)) * (0.4 + 0.6 * abs(sin(n * 0.37 + p * 9)))
                val len = 4.dp.toPx() + 30.dp.toPx() * amp.toFloat() * level
                val dir = Offset(sin(a).toFloat(), -cos(a).toFloat())
                val from = r + 6.dp.toPx()
                drawLine(scheme.primary, c + dir * from, c + dir * (from + len), 4.dp.toPx(), alpha = 0.75f * (1f - shrink))
            }
            drawCircle(scheme.surfaceContainerHigh, radius = r, center = c)
            drawCircle(scheme.onBackground, radius = r, center = c, style = Stroke(5.dp.toPx()))
        }
        Text(
            "see you\nnext time",
            fontFamily = BrandFontFamily,
            fontWeight = FontWeight.SemiBold,
            fontSize = 30.sp,
            lineHeight = 34.sp,
            textAlign = TextAlign.Center,
            color = scheme.onBackground,
            modifier = Modifier.offset(y = (-40).dp).graphicsLayer {
                scaleY = 1f - easeOut(fold)
                alpha = if (fold >= 1f) 0f else 1f
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
                    alpha = 1f - nameOut
                    translationY = 14.dp.toPx() * nameOut
                },
        )
    }
}

/**
 * Arcaea's shutter closes on the app, the lock's diamond draws on the seam with a plate saying "SEE YOU" over the
 * name, and the shutter parts onto the sign-in screen.
 */
@Composable
private fun LaneGoodbye(p: Float, name: String) {
    val scheme = MaterialTheme.colorScheme
    val shut = easeOut(span(p, 0f, 0.22f))
    val open = span(p, 0.74f, 1f)
    val closed = shut * (1f - open * open)
    val content = span(p, 0.2f, 0.28f) * (1f - span(p, 0.66f, 0.74f))
    val lock = easeOut(span(p, 0.2f, 0.32f))
    val plate = easeOut(span(p, 0.26f, 0.42f))
    // As in the Lane welcome: the plate's height follows the font scale, so the diamond sits a gap above its top edge.
    var plateHeight by remember { mutableIntStateOf(0) }

    Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
        Canvas(Modifier.fillMaxSize()) {
            drawShutter(closed, scheme.surfaceContainerHigh, scheme.surfaceContainerHighest, scheme.primary)
            val full = 56.dp.toPx()
            val d = full * lock
            if (d > 0f && content > 0f) {
                val c = Offset(size.width / 2, size.height / 2 - plateHeight / 2f - 24.dp.toPx() - full)
                val outer = Path().apply { moveTo(c.x, c.y - d); lineTo(c.x + d, c.y); lineTo(c.x, c.y + d); lineTo(c.x - d, c.y); close() }
                drawPath(outer, scheme.background, alpha = content)
                drawPath(outer, scheme.primary, alpha = content, style = Stroke(2.dp.toPx()))
            }
        }
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier
                .padding(horizontal = 32.dp)
                .onSizeChanged { plateHeight = it.height }
                .graphicsLayer {
                    alpha = plate * content
                    translationX = 64.dp.toPx() * (1f - plate)
                }
                .background(scheme.background, SlantShape(16.dp))
                .border(1.5.dp, scheme.primary, SlantShape(16.dp))
                .padding(horizontal = 40.dp, vertical = 14.dp),
        ) {
            Text("SEE YOU", style = MaterialTheme.typography.labelLarge, letterSpacing = 3.sp, color = scheme.primary)
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
 * SOUND VOLTEX's send-off: the entry screen as the welcome left it, then the critical line drops away, the appeal card
 * slides out to the left, the lasers pull back up, and THANK YOU FOR PLAYING stamps in.
 */
@Composable
private fun GearGoodbye(p: Float, name: String) {
    val scheme = MaterialTheme.colorScheme
    val drop = span(p, 0.12f, 0.28f)
    val card = span(p, 0.26f, 0.42f)
    val retract = easeOut(span(p, 0.34f, 0.56f))
    val stamp = span(p, 0.46f, 0.54f)
    val shake = if ((p * 60).toInt() % 2 == 0) 1f else -1f
    val jolt = if (stamp > 0f && stamp < 1f) (1f - stamp) * 8f * shake else 0f

    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .fillMaxSize()
            .graphicsLayer {
                alpha = goodbyeVeil(p)
                translationX = jolt.dp.toPx()
            }
            .background(scheme.background),
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val w = size.width
            val run = 1f - retract
            if (run > 0f) {
                val reach = size.height * 0.56f * run
                drawLine(scheme.primary, Offset(w * 0.06f, 0f), Offset(w * 0.06f + w * 0.18f * run, reach), 10.dp.toPx(), alpha = 0.85f)
                drawLine(GearLaserRight, Offset(w * 0.94f, 0f), Offset(w * 0.94f - w * 0.18f * run, reach), 10.dp.toPx(), alpha = 0.85f)
            }
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(contentAlignment = Alignment.Center, modifier = Modifier.height(64.dp)) {
                Text(
                    "THANK YOU\nFOR PLAYING",
                    fontFamily = GearDisplayFontFamily,
                    fontWeight = FontWeight.Black,
                    fontSize = 26.sp,
                    lineHeight = 30.sp,
                    letterSpacing = 3.sp,
                    textAlign = TextAlign.Center,
                    color = scheme.onBackground,
                    modifier = Modifier.graphicsLayer {
                        alpha = stamp
                        val s = 1.4f - 0.4f * stamp
                        scaleX = s
                        scaleY = s
                    },
                )
            }
            Spacer(Modifier.height(28.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .padding(horizontal = 32.dp)
                    .widthIn(max = 340.dp)
                    .fillMaxWidth()
                    .graphicsLayer {
                        alpha = 1f - span(p, 0.36f, 0.42f)
                        translationX = -420.dp.toPx() * card * card
                    }
                    .background(scheme.surfaceContainerHigh, MaterialTheme.shapes.large)
                    .border(2.dp, scheme.primary, MaterialTheme.shapes.large)
                    .padding(12.dp),
            ) {
                Box(contentAlignment = Alignment.Center, modifier = Modifier.size(64.dp).background(scheme.primary, MaterialTheme.shapes.medium)) {
                    Text(initial(name), fontFamily = GearDisplayFontFamily, fontWeight = FontWeight.Black, fontSize = 28.sp, color = GearInk)
                }
                Column(Modifier.padding(start = 14.dp)) {
                    Text("SEE YOU", fontFamily = GearDisplayFontFamily, fontWeight = FontWeight.Bold, fontSize = 11.sp, letterSpacing = 2.sp, color = scheme.primary)
                    Text(name, style = MaterialTheme.typography.titleLarge, color = scheme.onBackground, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            Spacer(Modifier.height(28.dp))
            Canvas(
                Modifier.fillMaxWidth().height(28.dp).graphicsLayer {
                    translationY = 160.dp.toPx() * drop * drop
                    alpha = 1f - drop
                },
            ) {
                val y = size.height / 2
                drawLine(GearCritical, Offset(0f, y), Offset(size.width, y), 5.dp.toPx())
            }
        }
    }
}

/**
 * maimai's send-off: the name plate lifts off the round screen, the slide star runs the ring back to the top,
 * "See you next play!" bounces in, and the screen shrinks shut.
 */
@Composable
private fun RingGoodbye(p: Float, name: String) {
    val scheme = MaterialTheme.colorScheme
    val lift = span(p, 0.08f, 0.26f)
    val back = span(p, 0.08f, 0.56f)
    val hello = overshoot(span(p, 0.26f, 0.4f))
    val shut = span(p, 0.62f, 0.84f)
    // A small swell before it closes, as maimai's screens do.
    val scale = if (shut < 0.25f) 1f + 0.06f * (shut / 0.25f) else 1.06f * (1f - easeOut((shut - 0.25f) / 0.75f))

    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier.fillMaxSize().graphicsLayer { alpha = goodbyeVeil(p) }.background(scheme.background),
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val c = Offset(size.width / 2, size.height / 2)
            val r = min(size.width, size.height) * 0.42f * scale
            if (r <= 0f) return@Canvas
            drawCircle(scheme.surfaceContainer, radius = r, center = c)
            drawCircle(RingSky, radius = r, center = c, style = Stroke(6.dp.toPx()))
            val left = 1f - back
            if (left > 0f) {
                drawArc(
                    scheme.primary, -90f, 360f * left, false, Offset(c.x - r, c.y - r), Size(r * 2, r * 2),
                    style = Stroke(6.dp.toPx(), cap = StrokeCap.Round),
                )
                val a = 2 * PI * left
                drawPath(starPath(Offset(c.x + r * sin(a).toFloat(), c.y - r * cos(a).toFloat()), 14.dp.toPx()), RingStar)
            }
        }
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.graphicsLayer {
                scaleX = scale
                scaleY = scale
            },
        ) {
            Box(Modifier.graphicsLayer {
                alpha = span(p, 0.26f, 0.3f)
                scaleX = hello
                scaleY = hello
            }) {
                val style = TextStyle(
                    fontFamily = RingFontFamily, fontWeight = FontWeight.ExtraBold, fontSize = 32.sp, lineHeight = 36.sp,
                    letterSpacing = 1.sp, textAlign = TextAlign.Center,
                )
                Text("See you\nnext play!", style = style.copy(color = RingInk, drawStyle = Stroke(width = 10f)))
                Text("See you\nnext play!", style = style.copy(color = RingYellow))
            }
            Spacer(Modifier.height(20.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .padding(horizontal = 32.dp)
                    .widthIn(max = 300.dp)
                    .fillMaxWidth()
                    .graphicsLayer {
                        alpha = 1f - lift
                        translationY = -90.dp.toPx() * lift * lift
                    }
                    .background(RingSky, RoundedCornerShape(18.dp))
                    .border(3.dp, RingInk, RoundedCornerShape(18.dp))
                    .padding(8.dp),
            ) {
                Box(contentAlignment = Alignment.Center, modifier = Modifier.size(52.dp).background(RingYellow, RoundedCornerShape(12.dp))) {
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
                    Text(name, fontFamily = RingFontFamily, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp, color = RingInk, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}
