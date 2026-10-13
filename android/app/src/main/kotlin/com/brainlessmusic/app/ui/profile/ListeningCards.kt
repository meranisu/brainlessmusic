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
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.VerticalDivider
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
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.drawBehind
import com.brainlessmusic.app.ui.common.RingDifficulties
import com.brainlessmusic.app.ui.common.RingInk
import com.brainlessmusic.app.ui.common.RingSky
import com.brainlessmusic.app.ui.common.RingYellow
import com.brainlessmusic.app.ui.theme.RingFontFamily
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

/** The range's hours, plays and songs, as a screen reader hears them; the cards' own descriptions start with it. */
private fun totalsSpoken(stats: UserStatsDto): String {
    val (value, label) = listenedHeadline(stats.totals.msListened)
    return "$value $label, ${plays(stats.totals.plays)}, ${stats.totals.tracks} songs"
}

/**
 * The range's raw numbers inside the listening card (owner, 2026-10-12): hours, plays and songs side by side, and how
 * the time compares with the window before. They were the player card's, which Home no longer has.
 */
@Composable
internal fun ListeningTotals(stats: UserStatsDto, range: StatsRange, modifier: Modifier = Modifier) {
    val (listenedValue, listenedLabel) = listenedHeadline(stats.totals.msListened)
    Column(modifier) {
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min)) {
            BigStat(listenedValue, listenedLabel, Modifier.weight(1f))
            VerticalDivider(color = MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.fillMaxHeight())
            BigStat("%,d".format(stats.totals.plays), if (stats.totals.plays == 1) "play" else "plays", Modifier.weight(1f))
            VerticalDivider(color = MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.fillMaxHeight())
            BigStat("%,d".format(stats.totals.tracks), if (stats.totals.tracks == 1) "song" else "songs", Modifier.weight(1f))
        }
        listenedDelta(stats, range)?.let {
            Text(
                it,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            )
        }
    }
}

/** Standard's listening on Home (A135): no game reading, just the range's numbers under a plain heading. */
@Composable
fun StandardListening(stats: UserStatsDto, range: StatsRange) {
    ListeningSurface {
        Column(Modifier.padding(16.dp)) {
            Text("Listening", style = MaterialTheme.typography.titleMedium)
            Text(
                "Since ${formatMonthYear(stats.memberSince)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            ListeningTotals(stats, range, Modifier.padding(top = 12.dp))
        }
    }
}

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
fun HitCircleListening(stats: UserStatsDto, range: StatsRange, owner: String? = null) {
    val scheme = MaterialTheme.colorScheme
    val (values, grow) = rememberReadings(stats, range)
    val overall = listeningOverall(values)
    ListeningSurface {
        Column(
            Modifier
                .padding(16.dp)
                .clearAndSetSemantics { contentDescription = "${totalsSpoken(stats)}. ${percent(overall)} overall: ${described(values)}" },
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
                        "${whose(owner)} ${range.label.lowercase()}, played like a beatmap",
                        style = MaterialTheme.typography.bodySmall,
                        color = scheme.onSurfaceVariant,
                    )
                }
            }
            ListeningTotals(stats, range, Modifier.padding(top = 16.dp))
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
fun LaneListening(stats: UserStatsDto, range: StatsRange, owner: String? = null) {
    val scheme = MaterialTheme.colorScheme
    val (values, grow) = rememberReadings(stats, range)
    val ptt = potential(listeningOverall(values))
    val pttText = "%.2f".format(Locale.ENGLISH, ptt)
    ListeningSurface {
        Column(
            Modifier
                .padding(16.dp)
                .clearAndSetSemantics { contentDescription = "${totalsSpoken(stats)}. Potential $pttText: ${described(values)}" },
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
                        "${whose(owner)} ${range.label.lowercase()}, rated like a player",
                        style = MaterialTheme.typography.bodySmall,
                        color = scheme.onSurfaceVariant,
                    )
                }
            }
            ListeningTotals(stats, range, Modifier.padding(top = 12.dp))
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

/** One of maimai's rating tiers: where it starts, its name and its plate colours (flat bands for rainbow). */
private class RatingTier(val from: Int, val name: String, val bands: List<Color>, val ink: Color)

private val RatingTiers = listOf(
    RatingTier(0, "White", listOf(Color(0xFFE8ECF4)), RingInk),
    RatingTier(1_000, "Blue", listOf(Color(0xFF2F7FD0)), Color.White),
    RatingTier(2_000, "Green", listOf(Color(0xFF2B8442)), Color.White),
    RatingTier(4_000, "Yellow", listOf(RingYellow), RingInk),
    RatingTier(7_000, "Red", listOf(Color(0xFFD63B32)), Color.White),
    RatingTier(10_000, "Purple", listOf(Color(0xFF9B4DCA)), Color.White),
    RatingTier(12_000, "Bronze", listOf(Color(0xFF9C5B2E)), Color.White),
    RatingTier(13_000, "Silver", listOf(Color(0xFFC3CBD8)), RingInk),
    RatingTier(14_000, "Gold", listOf(Color(0xFFF7D774)), RingInk),
    RatingTier(14_500, "Platinum", listOf(Color(0xFFD6EEF0)), RingInk),
    RatingTier(
        15_000,
        "Rainbow",
        listOf(Color(0xFFFFB3D4), Color(0xFFFFE08A), Color(0xFFB8F0C8), Color(0xFFA8E4FF), Color(0xFFD8C4FF)),
        RingInk,
    ),
)

/** The overall reading on maimai DX's rating scale, 0 to 16,750 (the top of its rainbow tiers). */
internal fun listeningRating(overall: Float): Int = (overall.coerceIn(0f, 1f) * 16_750).toInt()

/**
 * Ring's listening on Home: the same six readings, as maimai rates a player. The overall reading is a DX RATING plate,
 * five digits in dark boxes on a plate coloured by its tier (white up to rainbow, rainbow as flat bands, no gradient),
 * and the six follow as rounded bars in the cabinet's button colours.
 */
@Composable
fun RingListening(stats: UserStatsDto, range: StatsRange, owner: String? = null) {
    val scheme = MaterialTheme.colorScheme
    val (values, grow) = rememberReadings(stats, range)
    val rating = listeningRating(listeningOverall(values))
    val tier = RatingTiers.last { rating >= it.from }
    val next = RatingTiers.firstOrNull { it.from > rating }
    val shown = (rating * grow()).toInt().toString().padStart(5, '0')
    val barColors = listOf(scheme.primary, RingSky, RingYellow, RingDifficulties[0].color, RingDifficulties[3].color, RingDifficulties[2].color)
    ListeningSurface {
        Column(
            Modifier
                .padding(16.dp)
                .clearAndSetSemantics { contentDescription = "${totalsSpoken(stats)}. Listening rating $rating, ${tier.name}: ${described(values)}" },
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(18.dp))
                    .drawBehind {
                        val w = size.width / tier.bands.size
                        tier.bands.forEachIndexed { i, c -> drawRect(c, Offset(w * i, 0f), Size(w + 1f, size.height)) }
                    }
                    .border(3.dp, scheme.surfaceContainer, RoundedCornerShape(18.dp))
                    .padding(horizontal = 14.dp, vertical = 12.dp),
            ) {
                Column(Modifier.weight(1f)) {
                    Text("LISTENING", fontFamily = RingFontFamily, fontWeight = FontWeight.ExtraBold, fontSize = 11.sp, letterSpacing = 1.sp, color = tier.ink)
                    Text("RATING", fontFamily = RingFontFamily, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp, letterSpacing = 1.sp, color = tier.ink)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                    shown.forEach { digit ->
                        Box(
                            contentAlignment = Alignment.Center,
                            modifier = Modifier.size(width = 28.dp, height = 38.dp).background(Color(0xFF262F4D), RoundedCornerShape(7.dp)),
                        ) {
                            Text(digit.toString(), fontFamily = RingFontFamily, fontWeight = FontWeight.ExtraBold, fontSize = 22.sp, color = Color.White)
                        }
                    }
                }
            }
            Row(Modifier.fillMaxWidth().padding(top = 8.dp, start = 4.dp, end = 4.dp)) {
                Text(
                    "${tier.name} · ${whose(owner, capital = false)} ${range.label.lowercase()}",
                    style = MaterialTheme.typography.bodySmall,
                    color = scheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                if (next != null) {
                    Text("${next.name} at ${next.from}", style = MaterialTheme.typography.labelMedium, color = scheme.onSurfaceVariant)
                }
            }
            ListeningTotals(stats, range, Modifier.padding(top = 12.dp))
            Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Axes.forEachIndexed { i, axis ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            axis.name.lowercase().replaceFirstChar { it.uppercase() },
                            style = MaterialTheme.typography.labelLarge,
                            modifier = Modifier.width(80.dp),
                        )
                        Box(
                            Modifier
                                .weight(1f)
                                .height(12.dp)
                                .clip(CircleShape)
                                .background(scheme.surfaceContainerHighest),
                        ) {
                            Box(
                                Modifier
                                    .fillMaxHeight()
                                    .fillMaxWidth((values[i] * grow()).coerceIn(0f, 1f))
                                    .clip(CircleShape)
                                    .background(barColors[i % barColors.size]),
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
