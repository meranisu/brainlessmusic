package com.brainlessmusic.app.ui.profile

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.brainlessmusic.app.data.remote.dto.UserStatsDto
import com.brainlessmusic.app.data.repository.StatsRange
import com.brainlessmusic.app.ui.common.Diamond
import com.brainlessmusic.app.ui.playback.skins.rememberAnimationsOn
import com.brainlessmusic.app.ui.theme.BrandFontFamily
import com.brainlessmusic.app.ui.theme.LaneFontFamily
import com.brainlessmusic.app.ui.theme.SlantShape
import com.brainlessmusic.app.ui.theme.cardShape
import java.util.Locale

/** The readings for the range, and a 0-to-1 grow that runs once each time they change (held at 1 with animations off). */
@Composable
private fun rememberReadings(stats: UserStatsDto, range: StatsRange): Pair<List<Float>, () -> Float> {
    val values = remember(stats, range) { radarValues(stats, rangeDays(range, stats.memberSince)) }
    val animate = rememberAnimationsOn()
    val grow = remember { Animatable(if (animate) 0f else 1f) }
    LaunchedEffect(values) {
        if (animate) {
            grow.snapTo(0f)
            grow.animateTo(1f, tween(700, easing = FastOutSlowInEasing))
        }
    }
    return values to { grow.value }
}

private fun percent(v: Float) = "${(v * 100).toInt()}%"

private fun described(values: List<Float>) = Axes.indices.joinToString { "${Axes[it].name.lowercase()} ${percent(values[it])}" }

@Composable
private fun ListeningSurface(content: @Composable () -> Unit) {
    Surface(
        shape = MaterialTheme.cardShape,
        color = MaterialTheme.colorScheme.surfaceContainer,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        content = content,
    )
}

/**
 * Hit circle's listening on Home: the same six readings as Gear's radar, set out as osu! sets a beatmap. A large hit
 * circle holds the overall reading, its ring filling as a slider would and an approach ring closing on it as it lands;
 * under it six numbered circles, the combo numbers 1 to 6, each ringed to its reading.
 */
@Composable
fun HitCircleListening(stats: UserStatsDto, range: StatsRange) {
    val scheme = MaterialTheme.colorScheme
    val (values, grow) = rememberReadings(stats, range)
    val overall = listeningOverall(values)
    ListeningSurface {
        Column(
            Modifier
                .padding(16.dp)
                .clearAndSetSemantics { contentDescription = "Listening, ${percent(overall)} overall: ${described(values)}" },
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                HitCircle(size = 76.dp, value = overall, grow = grow, ringWidth = 5.dp, approach = true) {
                    Text(
                        "${(overall * 100).toInt()}",
                        fontFamily = BrandFontFamily,
                        fontWeight = FontWeight.Bold,
                        fontSize = 26.sp,
                        color = scheme.onSurface,
                    )
                }
                Column(Modifier.padding(start = 16.dp)) {
                    Text("Listening", style = MaterialTheme.typography.titleLarge)
                    Text(
                        "Your ${range.label.lowercase()}, played like a beatmap",
                        style = MaterialTheme.typography.bodySmall,
                        color = scheme.onSurfaceVariant,
                    )
                }
            }
            for (row in 0..1) {
                Row(Modifier.fillMaxWidth().padding(top = 16.dp)) {
                    for (col in 0..2) {
                        val i = row * 3 + col
                        Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                            HitCircle(size = 48.dp, value = values[i], grow = grow, ringWidth = 3.5.dp, approach = false) {
                                Text(
                                    "${i + 1}",
                                    fontFamily = BrandFontFamily,
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 18.sp,
                                    color = scheme.onSurface,
                                )
                            }
                            Text(
                                Axes[i].name.lowercase().replaceFirstChar { it.uppercase() },
                                style = MaterialTheme.typography.labelLarge,
                                modifier = Modifier.padding(top = 6.dp),
                            )
                            Text(percent(values[i]), style = MaterialTheme.typography.bodySmall, color = scheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}

/**
 * One hit circle: a faint track ring, the reading's arc in the accent from twelve o'clock, and with [approach] the
 * approach ring closing from twice the size as [grow] runs, gone once it lands.
 */
@Composable
private fun HitCircle(size: Dp, value: Float, grow: () -> Float, ringWidth: Dp, approach: Boolean, label: @Composable () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    Box(contentAlignment = Alignment.Center, modifier = Modifier.size(size)) {
        Canvas(Modifier.size(size)) {
            val w = ringWidth.toPx()
            val inset = w / 2
            val arcSize = Size(this.size.width - w, this.size.height - w)
            drawCircle(scheme.primary.copy(alpha = 0.12f), radius = this.size.minDimension / 2 - w)
            drawArc(scheme.outlineVariant, 0f, 360f, false, Offset(inset, inset), arcSize, style = Stroke(w))
            val g = grow()
            drawArc(scheme.primary, -90f, 360f * value * g, false, Offset(inset, inset), arcSize, style = Stroke(w, cap = StrokeCap.Round))
            if (approach && g < 1f) {
                drawCircle(
                    scheme.primary.copy(alpha = 1f - g),
                    radius = this.size.minDimension / 2 * (2f - g),
                    style = Stroke(2.dp.toPx()),
                )
            }
        }
        label()
    }
}

/** Arcaea's potential badge colours by rating, darkened so white figures on them read: blue, green, purple, wine, red. */
private fun potentialColor(p: Float): Color = when {
    p < 3.5f -> Color(0xFF2F6FB8)
    p < 7f -> Color(0xFF2E7D4F)
    p < 10f -> Color(0xFF7B4CC4)
    p < 11f -> Color(0xFF8E1F52)
    else -> Color(0xFFC41E3A)
}

/** The overall reading on Arcaea's potential scale, 0.00 to 13.00. */
internal fun potential(overall: Float): Float = overall.coerceIn(0f, 1f) * 13f

/**
 * Lane's listening on Home: the same six readings, as Arcaea rates a player. The overall reading is a potential in
 * its diamond badge, coloured by band as the game's is, and the six follow as slanted bars like its song rows.
 */
@Composable
fun LaneListening(stats: UserStatsDto, range: StatsRange) {
    val scheme = MaterialTheme.colorScheme
    val (values, grow) = rememberReadings(stats, range)
    val ptt = potential(listeningOverall(values))
    val pttText = "%.2f".format(Locale.ENGLISH, ptt)
    ListeningSurface {
        Column(
            Modifier
                .padding(16.dp)
                .clearAndSetSemantics { contentDescription = "Potential $pttText: ${described(values)}" },
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(contentAlignment = Alignment.Center, modifier = Modifier.size(80.dp)) {
                    Diamond(54.dp, scheme.onSurface, stroke = 1.5.dp)
                    Diamond(46.dp, potentialColor(ptt))
                    Text(pttText, fontFamily = LaneFontFamily, fontWeight = FontWeight.SemiBold, fontSize = 17.sp, color = Color.White)
                }
                Column(Modifier.padding(start = 12.dp)) {
                    Text("Potential", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Light)
                    Text(
                        "Your ${range.label.lowercase()}, rated like a player",
                        style = MaterialTheme.typography.bodySmall,
                        color = scheme.onSurfaceVariant,
                    )
                }
            }
            Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Axes.forEachIndexed { i, axis ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            axis.name.lowercase().replaceFirstChar { it.uppercase() },
                            style = MaterialTheme.typography.labelLarge,
                            modifier = Modifier.width(76.dp),
                        )
                        Box(
                            Modifier
                                .weight(1f)
                                .height(14.dp)
                                .clip(SlantShape(7.dp))
                                .background(scheme.surfaceContainerHighest),
                        ) {
                            Box(
                                Modifier
                                    .fillMaxHeight()
                                    .fillMaxWidth((values[i] * grow()).coerceIn(0f, 1f))
                                    .clip(SlantShape(7.dp))
                                    .background(scheme.primary),
                            )
                        }
                        Text(
                            percent(values[i]),
                            style = MaterialTheme.typography.bodySmall,
                            color = scheme.onSurfaceVariant,
                            textAlign = TextAlign.End,
                            modifier = Modifier.width(44.dp),
                        )
                    }
                }
            }
        }
    }
}
