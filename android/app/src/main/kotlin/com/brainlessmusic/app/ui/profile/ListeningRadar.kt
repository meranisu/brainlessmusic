package com.brainlessmusic.app.ui.profile

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import com.brainlessmusic.app.data.remote.dto.UserStatsDto
import com.brainlessmusic.app.data.repository.StatsRange
import com.brainlessmusic.app.ui.playback.skins.rememberAnimationsOn
import com.brainlessmusic.app.ui.theme.LocalDarkTheme
import com.brainlessmusic.app.ui.theme.cardShape
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.sin

/** One axis of the radar: its name and colour, after the six of SOUND VOLTEX's EFFECT RADAR, clockwise from the top. */
internal data class Axis(val name: String, val color: Color)

internal val Axes = listOf(
    Axis("PLAYS", Color(0xFF00E5FF)),
    Axis("TIME", Color(0xFFFF3355)),
    Axis("VARIETY", Color(0xFFFF2FD0)),
    Axis("REACH", Color(0xFFFFD400)),
    Axis("DEVOTION", Color(0xFF9B6BFF)),
    Axis("LOVED", Color(0xFF3DDC84)),
)

/** "Your", or "Sam's" on someone else's profile, where the cards also show (owner, 2026-10-13). */
internal fun whose(owner: String?, capital: Boolean = true): String = owner?.let { "$it's" } ?: if (capital) "Your" else "your"

/** How many days the stats cover: the range's own length, or for all time the days since the account began. */
internal fun rangeDays(range: StatsRange, memberSince: String, today: LocalDate = LocalDate.now()): Long = when (range) {
    StatsRange.WEEK -> 7
    StatsRange.MONTH -> 30
    StatsRange.YEAR -> 365
    StatsRange.ALL -> runCatching { ChronoUnit.DAYS.between(LocalDate.parse(memberSince.take(10)), today) + 1 }.getOrDefault(1)
}.coerceAtLeast(1)

/**
 * The six readings, each 0 to 1, in [Axes] order. Rates (plays and hours a day) and the like count rise toward 1 and
 * never quite reach it; the rest are shares:
 * - PLAYS: plays a day, 12 a day reading about two thirds.
 * - TIME: hours a day, one an hour reading about two thirds.
 * - VARIETY: different songs per play.
 * - REACH: different artists per song.
 * - DEVOTION: the top artist's share of all plays.
 * - LOVED: liked songs, 50 reading a half.
 */
internal fun radarValues(stats: UserStatsDto, days: Long): List<Float> {
    val plays = stats.totals.plays
    val d = days.coerceAtLeast(1).toDouble()
    fun rising(x: Double, k: Double) = (1 - exp(-x / k)).toFloat()
    fun share(part: Int, whole: Int) = if (whole <= 0) 0f else (part.toFloat() / whole).coerceIn(0f, 1f)
    val liked = stats.counts.liked
    return listOf(
        rising(plays / d, 12.0),
        rising(stats.totals.msListened / 3_600_000.0 / d, 1.0),
        share(stats.totals.tracks, plays),
        share(stats.totals.artists, stats.totals.tracks),
        share(stats.topArtists.firstOrNull()?.plays ?: 0, plays),
        liked.toFloat() / (liked + 50),
    )
}

/** The six readings as one, 0 to 1: their mean. Hit circle shows it as a percentage, Lane as Arcaea's potential. */
internal fun listeningOverall(values: List<Float>): Float = if (values.isEmpty()) 0f else values.average().toFloat().coerceIn(0f, 1f)

/**
 * Gear's listening radar on Home (A114 follow-up): your listening over the picked range as SOUND VOLTEX's EFFECT RADAR
 * draws a chart, a hexagon with six coloured axes. Flat lines and a translucent fill, no glow. It grows in when the
 * numbers arrive, unless animations are off.
 */
@Composable
fun ListeningRadar(stats: UserStatsDto, range: StatsRange, modifier: Modifier = Modifier, owner: String? = null) {
    val scheme = MaterialTheme.colorScheme
    val dark = LocalDarkTheme.current
    val values = remember(stats, range) { radarValues(stats, rangeDays(range, stats.memberSince)) }
    val animate = rememberAnimationsOn()
    val grow = remember { Animatable(if (animate) 0f else 1f) }
    LaunchedEffect(values) {
        if (animate) {
            grow.snapTo(0f)
            grow.animateTo(1f, tween(600, easing = FastOutSlowInEasing))
        }
    }
    val measurer = rememberTextMeasurer()
    val labelStyle = MaterialTheme.typography.labelSmall
    val described = Axes.indices.joinToString { "${Axes[it].name.lowercase()} ${(values[it] * 100).toInt()}%" }

    Surface(
        shape = MaterialTheme.cardShape,
        color = scheme.surfaceContainer,
        border = BorderStroke(1.dp, scheme.outline),
        modifier = modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text("LISTENING RADAR", style = MaterialTheme.typography.labelLarge, color = scheme.primary)
            Text(
                "${whose(owner)} ${range.label.lowercase()}, read like a chart",
                style = MaterialTheme.typography.bodySmall,
                color = scheme.onSurfaceVariant,
            )
            ListeningTotals(stats, range, Modifier.padding(top = 12.dp))
            Canvas(
                Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp)
                    .aspectRatio(1.25f)
                    .semantics { contentDescription = "Listening radar: $described" },
            ) {
                val c = Offset(size.width / 2, size.height / 2)
                val r = size.height * 0.36f
                fun at(i: Int, k: Float): Offset {
                    val a = -PI / 2 + i * PI / 3
                    return Offset(c.x + (r * k * cos(a)).toFloat(), c.y + (r * k * sin(a)).toFloat())
                }
                fun ring(k: Float) = Path().apply {
                    moveTo(at(0, k).x, at(0, k).y)
                    for (i in 1..5) lineTo(at(i, k).x, at(i, k).y)
                    close()
                }
                for (k in listOf(1f / 3, 2f / 3, 1f)) drawPath(ring(k), scheme.outlineVariant, style = Stroke(1.dp.toPx()))
                for (i in 0..5) drawLine(scheme.outlineVariant, c, at(i, 1f), 1.dp.toPx())

                val g = grow.value
                val shape = Path().apply {
                    values.forEachIndexed { i, v ->
                        val p = at(i, (0.04f + 0.96f * v) * g)
                        if (i == 0) moveTo(p.x, p.y) else lineTo(p.x, p.y)
                    }
                    close()
                }
                drawPath(shape, scheme.primary.copy(alpha = 0.22f))
                drawPath(shape, scheme.primary, style = Stroke(2.dp.toPx()))

                Axes.forEachIndexed { i, axis ->
                    drawCircle(axis.color, radius = 4.dp.toPx(), center = at(i, (0.04f + 0.96f * values[i]) * g))
                    // The names in their axis colours on the dark grounds; on a light one the ink, its colour as a mark.
                    val label = measurer.measure(axis.name, TextStyle(fontFamily = labelStyle.fontFamily, fontWeight = labelStyle.fontWeight, fontSize = labelStyle.fontSize, color = if (dark) axis.color else scheme.onSurface))
                    val p = at(i, 1.22f)
                    drawText(label, topLeft = Offset(p.x - label.size.width / 2f, p.y - label.size.height / 2f))
                    if (!dark) drawCircle(axis.color, radius = 3.dp.toPx(), center = Offset(p.x - label.size.width / 2f - 6.dp.toPx(), p.y))
                }
            }
        }
    }
}
