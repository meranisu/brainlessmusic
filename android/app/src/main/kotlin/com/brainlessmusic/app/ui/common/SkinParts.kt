package com.brainlessmusic.app.ui.common

import androidx.compose.foundation.Canvas
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import com.brainlessmusic.app.ui.playback.skins.rememberAnimationsOn
import com.brainlessmusic.app.ui.theme.LaneFontFamily
import com.brainlessmusic.app.ui.theme.SlantShape
import com.brainlessmusic.app.ui.theme.AppIcons
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.Role
import androidx.compose.material3.IconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.clickable
import androidx.compose.ui.graphics.Shape
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.draw.rotate
import androidx.compose.foundation.shape.CutCornerShape
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.widthIn
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBarDefaults
import androidx.compose.material3.NavigationBarItemColors
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.SheetState
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.brainlessmusic.app.data.local.Skin
import com.brainlessmusic.app.ui.theme.BrandFontFamily
import com.brainlessmusic.app.ui.theme.GearDisplayFontFamily
import com.brainlessmusic.app.ui.theme.GearFontFamily
import com.brainlessmusic.app.ui.theme.LocalSkin
import com.brainlessmusic.app.ui.theme.RingFontFamily
import com.brainlessmusic.app.ui.theme.laneCut

// The small pieces every screen shares that change with the skin (A118). Standard draws exactly what it did before.

/** SOUND VOLTEX's fixed console colours, the same in every colour theme: the right knob's laser and the FX keys. */
val GearLaserRight = Color(0xFFFF2FD0)
val GearFx = Color(0xFFFF8A1F)

/** The critical line's red. */
val GearCritical = Color(0xFFFF3355)

/** SOUND VOLTEX's difficulty colours: NOVICE, ADVANCED, EXHAUST, MAXIMUM. */
val GearDifficultyColors = listOf(Color(0xFF7A5CFF), Color(0xFFFFD400), Color(0xFFFF3355), Color(0xFFD8DCE8))

/** The ink on a lit difficulty box or key, dark on all four colours and on the FX orange. */
val GearInk = Color(0xFF0A0F2C)

/** maimai's cabinet colours, the same in every colour theme: the sky-blue arrow buttons and the yellow tabs. */
val RingSky = Color(0xFF1597D8)
val RingYellow = Color(0xFFFFC928)

/** The slide star's blue, a shade lighter than the buttons. */
val RingStar = Color(0xFF22BFF5)

/** maimai's navy ink, for text on the yellow and lavender lights. */
val RingInk = Color(0xFF13306E)

/** One of maimai's difficulties: its name, its colour, and the ink that reads on that colour. */
data class RingDifficulty(val name: String, val color: Color, val ink: Color)

/** BASIC, ADVANCED, EXPERT, MASTER, Re:MASTER, in maimai's green, yellow, red, purple and white (lavender here, to show on white). */
val RingDifficulties = listOf(
    RingDifficulty("BASIC", Color(0xFF2B8442), Color.White),
    RingDifficulty("ADVANCED", RingYellow, RingInk),
    RingDifficulty("EXPERT", Color(0xFFD63B32), Color.White),
    RingDifficulty("MASTER", Color(0xFF9B4DCA), Color.White),
    RingDifficulty("Re:MASTER", Color(0xFFC9B2F0), RingInk),
)

/** A five-pointed star, maimai's slide star, centred on [center] with points [radius] out. */
fun starPath(center: Offset, radius: Float): Path = Path().apply {
    val inner = radius * 0.47f
    for (i in 0 until 10) {
        val r = if (i % 2 == 0) radius else inner
        val a = Math.toRadians(-90.0 + i * 36.0)
        val x = center.x + r * kotlin.math.cos(a).toFloat()
        val y = center.y + r * kotlin.math.sin(a).toFloat()
        if (i == 0) moveTo(x, y) else lineTo(x, y)
    }
    close()
}

/** Whether the playing song in a list gets a [PlayingMarker]; Standard marks it with bold accent text only. */
val markPlaying: Boolean
    @Composable get() = LocalSkin.current != Skin.STANDARD

/** The mark for the playing song in a list: a small hit circle in Hit circle, a filled diamond in Lane, a lit button in Ring. */
@Composable
fun PlayingMarker(modifier: Modifier = Modifier) {
    if (LocalSkin.current == Skin.GEAR) {
        // A BT chip, the note the game's white keys hit.
        Box(modifier.size(16.dp), contentAlignment = Alignment.Center) {
            Box(Modifier.size(width = 16.dp, height = 7.dp).background(MaterialTheme.colorScheme.primary, CutCornerShape(2.dp)))
        }
        return
    }
    if (LocalSkin.current == Skin.LANE) {
        Box(modifier.size(16.dp), contentAlignment = Alignment.Center) { Diamond(11.dp, MaterialTheme.colorScheme.primary) }
        return
    }
    if (LocalSkin.current == Skin.RING) {
        // A lit cabinet button: a ring with its light on inside.
        Box(
            modifier
                .size(16.dp)
                .border(2.dp, MaterialTheme.colorScheme.primary, CircleShape)
                .padding(4.dp)
                .background(MaterialTheme.colorScheme.primary, CircleShape),
        )
        return
    }
    Box(modifier.size(16.dp).border(3.dp, MaterialTheme.colorScheme.primary, CircleShape))
}

/** Arcaea's badge shape: a square turned 45 degrees, [side] along each edge, filled or (with [stroke]) outlined. */
@Composable
fun Diamond(side: Dp, color: Color, modifier: Modifier = Modifier, stroke: Dp? = null) {
    Box(
        modifier
            .size(side)
            .rotate(45f)
            .then(if (stroke == null) Modifier.background(color) else Modifier.border(stroke, color)),
    )
}

/**
 * A queue row's lead mark, [position] songs from the playing one. Hit circle numbers the run like osu!'s combo: the
 * playing song is a filled circle, the next ones count 1, 2, 3, and played ones fade. Gear does the same with
 * two-digit keys. Standard and Lane have none.
 */
@Composable
fun QueueMarker(position: Int, modifier: Modifier = Modifier) {
    val scheme = MaterialTheme.colorScheme
    if (LocalSkin.current == Skin.GEAR) {
        // Gear numbers the coming tracks as the game counts its stages, "01", "02"; the playing one is a lit key.
        Box(
            contentAlignment = Alignment.Center,
            modifier = modifier
                .size(width = 32.dp, height = 22.dp)
                .alpha(if (position < 0) 0.4f else 1f)
                .then(
                    if (position == 0) {
                        Modifier.background(scheme.primary, CutCornerShape(4.dp))
                    } else {
                        Modifier.border(1.5.dp, scheme.outline, CutCornerShape(4.dp))
                    },
                ),
        ) {
            if (position > 0) {
                Text(
                    if (position < 100) "%02d".format(position) else "99+",
                    fontFamily = GearDisplayFontFamily,
                    fontWeight = FontWeight.Bold,
                    fontSize = 10.sp,
                    color = scheme.onSurface,
                )
            } else if (position == 0) {
                Icon(AppIcons.play, contentDescription = null, tint = scheme.onPrimary, modifier = Modifier.size(12.dp))
            }
        }
        return
    }
    if (LocalSkin.current != Skin.HIT_CIRCLE) return
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .size(30.dp)
            .alpha(if (position < 0) 0.4f else 1f)
            .background(if (position == 0) scheme.primary else Color.Transparent, CircleShape)
            .border(2.5.dp, if (position == 0) scheme.onSurface else scheme.primary, CircleShape),
    ) {
        if (position > 0) {
            Text(
                position.toString(),
                fontFamily = BrandFontFamily,
                fontWeight = FontWeight.Bold,
                fontSize = if (position < 100) 13.sp else 10.sp,
                color = scheme.onSurface,
            )
        }
    }
}

/**
 * The mini player's progress along its top edge: Material's thin line, or in Lane a judgement line with a diamond at
 * its head. Hit circle rings the cover instead ([MiniCover]).
 */
@Composable
fun MiniProgress(progress: Float, modifier: Modifier = Modifier) {
    when (LocalSkin.current) {
        Skin.STANDARD -> LinearProgressIndicator(progress = { progress }, modifier = modifier.fillMaxWidth().height(2.dp))
        Skin.HIT_CIRCLE -> Unit
        Skin.GEAR -> {
            // The song as a laser running up to the critical line: cyan behind, the line's red tick at the head.
            val scheme = MaterialTheme.colorScheme
            Canvas(modifier.fillMaxWidth().height(6.dp)) {
                val y = size.height / 2
                val x = size.width * progress.coerceIn(0f, 1f)
                drawLine(scheme.outlineVariant, Offset(0f, y), Offset(size.width, y), 2.dp.toPx())
                drawLine(scheme.primary, Offset(0f, y), Offset(x, y), 3.dp.toPx())
                drawLine(GearCritical, Offset(x, 0f), Offset(x, size.height), 3.dp.toPx())
            }
        }
        Skin.RING -> {
            // The song as a rounded bar with the slide star riding its head.
            val scheme = MaterialTheme.colorScheme
            Canvas(modifier.fillMaxWidth().height(10.dp)) {
                val y = size.height / 2
                val x = size.width * progress.coerceIn(0f, 1f)
                drawLine(scheme.outlineVariant, Offset(0f, y), Offset(size.width, y), 3.dp.toPx(), cap = StrokeCap.Round)
                drawLine(scheme.primary, Offset(0f, y), Offset(x, y), 3.dp.toPx(), cap = StrokeCap.Round)
                drawPath(starPath(Offset(x.coerceIn(5.dp.toPx(), size.width - 5.dp.toPx()), y), 5.dp.toPx()), RingStar)
            }
        }
        Skin.LANE -> {
            val scheme = MaterialTheme.colorScheme
            Canvas(modifier.fillMaxWidth().height(6.dp)) {
                val y = size.height / 2
                val x = size.width * progress.coerceIn(0f, 1f)
                // `outline`, not `outlineVariant`: the mini player's panel is `outlineVariant`'s own shade in the dark.
                drawLine(scheme.outline, Offset(0f, y), Offset(size.width, y), 1.dp.toPx())
                drawLine(scheme.primary, Offset(0f, y), Offset(x, y), 2.dp.toPx())
                val r = 3.dp.toPx()
                drawPath(
                    Path().apply { moveTo(x, y - r); lineTo(x + r, y); lineTo(x, y + r); lineTo(x - r, y); close() },
                    scheme.primary,
                )
            }
        }
    }
}

/**
 * The mini player's cover. Lane frames it as the player does. In Hit circle it is round with the song's progress running clockwise around it from the
 * top, like a hit circle's approach.
 */
@Composable
fun MiniCover(url: String?, progress: Float) {
    if (LocalSkin.current == Skin.LANE) {
        // The player's info-pane frame, scaled down: an accent outline cut on the diagonal.
        Box(
            Modifier
                .size(48.dp)
                .border(1.5.dp, MaterialTheme.colorScheme.primary, laneCut(7.dp))
                .padding(3.dp)
                .clip(laneCut(5.dp)),
        ) {
            CoverImage(url = url, contentDescription = null, cornerRadius = 0.dp, modifier = Modifier.fillMaxSize())
        }
        return
    }
    if (LocalSkin.current != Skin.HIT_CIRCLE) {
        CoverImage(url = url, contentDescription = null, modifier = Modifier.size(44.dp))
        return
    }
    val scheme = MaterialTheme.colorScheme
    Box(contentAlignment = Alignment.Center, modifier = Modifier.size(48.dp)) {
        Canvas(Modifier.fillMaxSize()) {
            val stroke = 3.dp.toPx()
            val inset = stroke / 2
            val arcSize = Size(size.width - stroke, size.height - stroke)
            drawArc(scheme.surfaceContainerHighest, 0f, 360f, false, Offset(inset, inset), arcSize, style = Stroke(stroke))
            drawArc(
                scheme.primary, -90f, 360f * progress.coerceIn(0f, 1f), false, Offset(inset, inset), arcSize,
                style = Stroke(stroke, cap = StrokeCap.Round),
            )
        }
        CoverImage(url = url, contentDescription = null, modifier = Modifier.size(38.dp))
    }
}

/**
 * One button's shape in a segmented row (light/dark, Week/Month/Year). Lane cuts the outer ends on the diagonal, as
 * its panels are cut; the others keep Material's pill ends.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun segmentShape(index: Int, count: Int): Shape = when {
    LocalSkin.current == Skin.GEAR -> when {
        count == 1 -> CutCornerShape(8.dp)
        index == 0 -> CutCornerShape(topStart = 8.dp, bottomStart = 8.dp)
        index == count - 1 -> CutCornerShape(topEnd = 8.dp, bottomEnd = 8.dp)
        else -> RectangleShape
    }
    LocalSkin.current != Skin.LANE -> SegmentedButtonDefaults.itemShape(index, count)
    count == 1 -> CutCornerShape(topStart = 10.dp, bottomEnd = 10.dp)
    index == 0 -> CutCornerShape(topStart = 10.dp)
    index == count - 1 -> CutCornerShape(bottomEnd = 10.dp)
    else -> RectangleShape
}

/** A sheet's handle: Material's bar, or in Lane a slanted bar between two diamonds. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SkinDragHandle() {
    if (LocalSkin.current != Skin.LANE) {
        BottomSheetDefaults.DragHandle()
        return
    }
    val scheme = MaterialTheme.colorScheme
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier.padding(vertical = 16.dp),
    ) {
        Diamond(5.dp, scheme.primary)
        Box(Modifier.size(width = 36.dp, height = 4.dp).clip(SlantShape(3.dp)).background(scheme.onSurfaceVariant))
        Diamond(5.dp, scheme.primary)
    }
}

/** The tab bar's fill: Material's, or in the game skins a shade up, so it reads apart from the mini player above it. */
@Composable
fun tabBarColor(): Color =
    if (LocalSkin.current != Skin.STANDARD) MaterialTheme.colorScheme.surfaceContainerHighest else NavigationBarDefaults.containerColor

/**
 * The line a docked bar is closed with: Lane's outline, as Arcaea edges its panels, or Gear's cyan console edge;
 * nothing in the other skins.
 */
@Composable
fun EdgeLine(modifier: Modifier = Modifier) {
    when (LocalSkin.current) {
        Skin.LANE -> Box(modifier.fillMaxWidth().height(1.dp).background(MaterialTheme.colorScheme.outline))
        Skin.GEAR -> Box(modifier.fillMaxWidth().height(2.dp).background(MaterialTheme.colorScheme.primary))
        Skin.RING -> Box(modifier.fillMaxWidth().height(2.dp).background(MaterialTheme.colorScheme.outlineVariant))
        else -> Unit
    }
}

/** The mini player's play button: an icon button, or in Lane a small accent diamond like its player's. */
@Composable
fun MiniPlayButton(playing: Boolean, buffering: Boolean, onClick: () -> Unit) {
    val label = if (playing) "Pause" else "Play"
    if (LocalSkin.current == Skin.GEAR) {
        GearMiniKey(playing, buffering, label, onClick)
        return
    }
    if (LocalSkin.current == Skin.RING) {
        RingMiniButton(playing, buffering, label, onClick)
        return
    }
    if (LocalSkin.current != Skin.LANE) {
        IconButton(onClick = onClick) {
            if (buffering && !playing) {
                CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
            } else {
                Icon(if (playing) AppIcons.pause else AppIcons.play, contentDescription = label)
            }
        }
        return
    }
    val scheme = MaterialTheme.colorScheme
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .size(48.dp)
            .clickable(role = Role.Button, onClickLabel = null, onClick = onClick)
            .semantics { contentDescription = label },
    ) {
        Box(Modifier.size(28.dp).rotate(45f).background(scheme.primary))
        if (buffering && !playing) {
            CircularProgressIndicator(modifier = Modifier.size(18.dp), color = scheme.onPrimary, strokeWidth = 2.dp)
        } else {
            Icon(if (playing) AppIcons.pause else AppIcons.play, contentDescription = null, tint = scheme.onPrimary, modifier = Modifier.size(18.dp))
        }
    }
}

/** Lane and Gear dock a screen's header (the Library's tabs) as a full-width strip; the others float it as a pill. */
val dockedHeader: Boolean
    @Composable get() = LocalSkin.current == Skin.LANE || LocalSkin.current == Skin.GEAR

/** Hit circle floats the mini player and the tab bar as outlined pills off the edge; Standard docks them. */
val floatingBars: Boolean
    @Composable get() = LocalSkin.current == Skin.HIT_CIRCLE

/** Bottom-bar colours: the game skins drop Material's pill behind the selected tab; [TabIcon] draws their mark. */
@Composable
fun tabColors(): NavigationBarItemColors = when (LocalSkin.current) {
    Skin.STANDARD -> NavigationBarItemDefaults.colors()
    // The selected tab is lit ([TabIcon]: Hit circle's filled circle, Lane's slanted key, Gear's BT key), so its icon
    // takes the light's ink.
    Skin.HIT_CIRCLE, Skin.LANE, Skin.GEAR, Skin.RING -> NavigationBarItemDefaults.colors(
        indicatorColor = Color.Transparent,
        selectedIconColor = MaterialTheme.colorScheme.onPrimary,
        selectedTextColor = MaterialTheme.colorScheme.primary,
    )
}

/**
 * A bottom-bar icon. Hit circle lights the selected tab as a hit circle, an approach ring closing on it as it opens,
 * the others outlined circles waiting their turn; Lane lights it as a slanted key, Arcaea's song-row shape; Gear makes
 * every tab a BT key, the open one lit. The game skins have no ripple ([LibraryBottomBar]): [pressed] lights the key's
 * own shape instead, held long enough to see on a quick tap.
 */
@Composable
fun TabIcon(selected: Boolean, pressed: Boolean = false, content: @Composable () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    val press = remember { Animatable(0f) }
    var armed by remember { mutableStateOf(false) }
    LaunchedEffect(pressed) {
        if (pressed) {
            armed = true
            press.animateTo(1f, tween(60))
        } else if (armed) {
            press.animateTo(1f, tween(60))
            press.animateTo(0f, tween(260))
        }
    }
    val ink = LocalContentColor.current
    fun Modifier.pressMark(shape: Shape) = drawWithContent {
        drawContent()
        val p = press.value
        if (p > 0f) drawOutline(shape.createOutline(size, layoutDirection, this), ink.copy(alpha = 0.2f * p))
    }
    when {
        LocalSkin.current == Skin.HIT_CIRCLE -> {
            val animate = rememberAnimationsOn()
            val approach = remember { Animatable(1f) }
            LaunchedEffect(selected) {
                if (selected && animate) {
                    approach.snapTo(0f)
                    approach.animateTo(1f, tween(320, easing = LinearOutSlowInEasing))
                }
            }
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .size(34.dp)
                    .drawBehind {
                        val p = approach.value
                        if (selected && p < 1f) {
                            drawCircle(scheme.primary.copy(alpha = 1f - p), radius = size.minDimension / 2 * (2f - p), style = Stroke(2.dp.toPx()))
                        }
                    }
                    .then(
                        if (selected) {
                            Modifier.background(scheme.primary, CircleShape).border(2.dp, scheme.onSurface.copy(alpha = 0.5f), CircleShape)
                        } else {
                            Modifier.border(1.5.dp, scheme.outline, CircleShape)
                        },
                    )
                    .pressMark(CircleShape),
            ) { Box(Modifier.size(20.dp), contentAlignment = Alignment.Center) { content() } }
        }
        // Gear: every tab a BT key on the console, the open one lit.
        LocalSkin.current == Skin.GEAR -> Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(width = 44.dp, height = 26.dp)
                .then(
                    if (selected) {
                        Modifier.background(MaterialTheme.colorScheme.primary, CutCornerShape(5.dp))
                    } else {
                        Modifier.border(1.5.dp, MaterialTheme.colorScheme.outline, CutCornerShape(5.dp))
                    },
                )
                .pressMark(CutCornerShape(5.dp)),
        ) { content() }
        // Ring: every tab one of the cabinet's round buttons, the open one lit, its pale rim inside the coloured edge.
        LocalSkin.current == Skin.RING -> Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(38.dp)
                .then(
                    if (selected) {
                        Modifier.border(2.dp, scheme.primary, CircleShape).padding(3.dp).background(scheme.primary, CircleShape)
                    } else {
                        Modifier.border(2.dp, scheme.outlineVariant, CircleShape)
                    },
                )
                .pressMark(CircleShape),
        ) { Box(Modifier.size(20.dp), contentAlignment = Alignment.Center) { content() } }
        // Lane: the key is only drawn lit, but a press shows its slant on any tab.
        LocalSkin.current == Skin.LANE -> Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(width = 52.dp, height = 28.dp)
                .then(if (selected) Modifier.background(scheme.primary, SlantShape(9.dp)) else Modifier)
                .pressMark(SlantShape(9.dp)),
        ) { content() }
        else -> content()
    }
}

/**
 * A bottom-bar tab's name, on one line. Gear sets it in its narrower text face (Chakra Petch): its label face, Orbitron,
 * is too wide for a tab, and "Downloads" ran past its slot. Hit circle's is Fredoka, Lane's Exo 2, both at 12 sp so
 * "Downloads" fits.
 */
@Composable
fun TabLabel(text: String) {
    when (LocalSkin.current) {
        Skin.STANDARD -> Text(text)
        Skin.HIT_CIRCLE -> Text(text, fontFamily = BrandFontFamily, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, maxLines = 1, softWrap = false)
        Skin.LANE -> Text(text, fontFamily = LaneFontFamily, fontWeight = FontWeight.Medium, fontSize = 12.sp, maxLines = 1, softWrap = false)
        Skin.GEAR -> Text(text, fontFamily = GearFontFamily, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, maxLines = 1, softWrap = false)
        Skin.RING -> Text(text, fontFamily = RingFontFamily, fontWeight = FontWeight.Bold, fontSize = 12.sp, maxLines = 1, softWrap = false)
    }
}

/**
 * A bottom sheet. The game skins show it as an outlined card in the middle of the screen (Q123; Lane on the owner's
 * word, 2026-10-11): Hit circle's rounded, Lane's an Arcaea panel with two corners cut, Gear's chamfered all round.
 * Standard docks it as Material's sheet.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SkinSheet(
    onDismissRequest: () -> Unit,
    sheetState: SheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    dragHandle: @Composable (() -> Unit)? = { SkinDragHandle() },
    content: @Composable ColumnScope.() -> Unit,
) {
    val skin = LocalSkin.current
    if (skin == Skin.STANDARD) {
        ModalBottomSheet(onDismissRequest = onDismissRequest, sheetState = sheetState, dragHandle = dragHandle, content = content)
        return
    }
    // A dialog, not a sheet: nothing to drag, so no handle, and `sheetState` goes unused. Capped in height so a long
    // list (the queue) scrolls inside the card rather than running off the screen.
    val shape = when (skin) {
        Skin.LANE -> laneCut(28.dp)
        Skin.GEAR -> CutCornerShape(14.dp)
        else -> RoundedCornerShape(28.dp)
    }
    val maxHeight = (LocalConfiguration.current.screenHeightDp * 0.85f).dp
    Dialog(onDismissRequest = onDismissRequest, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(
            Modifier
                .padding(horizontal = 16.dp)
                .widthIn(max = 560.dp)
                .fillMaxWidth()
                .heightIn(max = maxHeight)
                .clip(shape)
                .background(BottomSheetDefaults.ContainerColor)
                .border(1.dp, MaterialTheme.colorScheme.outline, shape)
                .padding(vertical = 12.dp),
            content = content,
        )
    }
}

/** Gear's mini play key: a small white BT key with the navy glyph, as on the console. */
@Composable
private fun GearMiniKey(playing: Boolean, buffering: Boolean, label: String, onClick: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .size(48.dp)
            .clickable(role = Role.Button, onClickLabel = null, onClick = onClick)
            .semantics { contentDescription = label },
    ) {
        Box(Modifier.size(width = 40.dp, height = 30.dp).background(scheme.onSurface, CutCornerShape(5.dp)))
        if (buffering && !playing) {
            CircularProgressIndicator(modifier = Modifier.size(16.dp), color = scheme.surface, strokeWidth = 2.dp)
        } else {
            Icon(if (playing) AppIcons.pause else AppIcons.play, contentDescription = null, tint = scheme.surface, modifier = Modifier.size(18.dp))
        }
    }
}

/** Ring's mini play button: a small lit cabinet button, the accent with a pale rim. */
@Composable
private fun RingMiniButton(playing: Boolean, buffering: Boolean, label: String, onClick: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .size(48.dp)
            .clickable(role = Role.Button, onClickLabel = null, onClick = onClick)
            .semantics { contentDescription = label },
    ) {
        Box(Modifier.size(40.dp).background(scheme.primary, CircleShape).border(3.dp, scheme.surface, CircleShape))
        if (buffering && !playing) {
            CircularProgressIndicator(modifier = Modifier.size(16.dp), color = scheme.onPrimary, strokeWidth = 2.dp)
        } else {
            Icon(if (playing) AppIcons.pause else AppIcons.play, contentDescription = null, tint = scheme.onPrimary, modifier = Modifier.size(18.dp))
        }
    }
}
