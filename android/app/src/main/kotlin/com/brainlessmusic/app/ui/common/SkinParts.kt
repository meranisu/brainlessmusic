package com.brainlessmusic.app.ui.common

import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.windowInsetsPadding
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
import com.brainlessmusic.app.ui.theme.LocalSkin

// The small pieces every screen shares that change with the skin (A118). Standard draws exactly what it did before.

/** Whether the playing song in a list gets a [PlayingMarker]; Standard marks it with bold accent text only. */
val markPlaying: Boolean
    @Composable get() = LocalSkin.current != Skin.STANDARD

/** The mark for the playing song in a list: a small hit circle in Hit circle, a filled diamond in Lane. */
@Composable
fun PlayingMarker(modifier: Modifier = Modifier) {
    if (LocalSkin.current == Skin.LANE) {
        Box(modifier.size(16.dp), contentAlignment = Alignment.Center) { Diamond(11.dp, MaterialTheme.colorScheme.primary) }
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
 * playing song is a filled circle, the next ones count 1, 2, 3, and played ones fade. Standard has none.
 */
@Composable
fun QueueMarker(position: Int, modifier: Modifier = Modifier) {
    if (LocalSkin.current != Skin.HIT_CIRCLE) return
    val scheme = MaterialTheme.colorScheme
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
        Skin.LANE -> {
            val scheme = MaterialTheme.colorScheme
            Canvas(modifier.fillMaxWidth().height(6.dp)) {
                val y = size.height / 2
                val x = size.width * progress.coerceIn(0f, 1f)
                drawLine(scheme.outlineVariant, Offset(0f, y), Offset(size.width, y), 1.dp.toPx())
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
 * The mini player's cover. In Hit circle it is round with the song's progress running clockwise around it from the
 * top, like a hit circle's approach.
 */
@Composable
fun MiniCover(url: String?, progress: Float) {
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

/** The tab bar's fill: Material's, or in Lane a shade up, so it reads apart from the mini player docked above it. */
@Composable
fun tabBarColor(): Color =
    if (LocalSkin.current == Skin.LANE) MaterialTheme.colorScheme.surfaceContainerHighest else NavigationBarDefaults.containerColor

/** The line Lane closes a docked bar with, as Arcaea edges its panels; nothing in the other skins. */
@Composable
fun EdgeLine(modifier: Modifier = Modifier) {
    if (LocalSkin.current != Skin.LANE) return
    Box(modifier.fillMaxWidth().height(1.dp).background(MaterialTheme.colorScheme.outline))
}

/** The mini player's play button: an icon button, or in Lane a small accent diamond like its player's. */
@Composable
fun MiniPlayButton(playing: Boolean, buffering: Boolean, onClick: () -> Unit) {
    val label = if (playing) "Pause" else "Play"
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

/** Lane docks a screen's header (the Library's tabs) as a full-width strip; the others float it as a pill. */
val dockedHeader: Boolean
    @Composable get() = LocalSkin.current == Skin.LANE

/** Hit circle floats the mini player and the tab bar as outlined pills off the edge; Standard docks them. */
val floatingBars: Boolean
    @Composable get() = LocalSkin.current == Skin.HIT_CIRCLE

/** Bottom-bar colours: the game skins drop Material's pill behind the selected tab; [TabIcon] draws their mark. */
@Composable
fun tabColors(): NavigationBarItemColors = when (LocalSkin.current) {
    Skin.STANDARD -> NavigationBarItemDefaults.colors()
    Skin.HIT_CIRCLE, Skin.LANE -> NavigationBarItemDefaults.colors(
        indicatorColor = Color.Transparent,
        selectedIconColor = MaterialTheme.colorScheme.primary,
        selectedTextColor = MaterialTheme.colorScheme.primary,
    )
}

/** A bottom-bar icon: Hit circle rings the selected tab's, like a circle waiting to be hit; Lane sets it in a diamond. */
@Composable
fun TabIcon(selected: Boolean, content: @Composable () -> Unit) {
    when {
        selected && LocalSkin.current == Skin.HIT_CIRCLE -> Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier.size(34.dp).border(2.5.dp, MaterialTheme.colorScheme.primary, CircleShape),
        ) { content() }
        selected && LocalSkin.current == Skin.LANE -> Box(contentAlignment = Alignment.Center, modifier = Modifier.size(36.dp)) {
            Diamond(25.dp, MaterialTheme.colorScheme.primary, stroke = 1.5.dp)
            content()
        }
        else -> content()
    }
}

/**
 * A bottom sheet. Hit circle shows it as an outlined card in the middle of the screen (Q123), like its floating mini
 * player and tab bar; Lane docks it with a cut corner; Standard docks it as Material's sheet.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SkinSheet(
    onDismissRequest: () -> Unit,
    sheetState: SheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    dragHandle: @Composable (() -> Unit)? = { SkinDragHandle() },
    content: @Composable ColumnScope.() -> Unit,
) {
    val lane = LocalSkin.current == Skin.LANE
    if (!lane && !floatingBars) {
        ModalBottomSheet(onDismissRequest = onDismissRequest, sheetState = sheetState, dragHandle = dragHandle, content = content)
        return
    }
    if (!lane) {
        // A dialog, not a sheet: nothing to drag, so no handle, and `sheetState` goes unused. Capped in height so a long
        // list (the queue) scrolls inside the card rather than running off the screen.
        val shape = RoundedCornerShape(28.dp)
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
        return
    }
    // An Arcaea panel, the top-left corner cut away. Drawn inside the sheet's content, not through its `modifier`:
    // Material applies that before it slides the sheet into place, so a border there stayed behind where the sheet was
    // laid out while the panel itself moved up from the bottom. The insets go inside, so the panel runs under the
    // navigation bar.
    val shape = CutCornerShape(topStart = 28.dp)
    ModalBottomSheet(
        onDismissRequest = onDismissRequest,
        sheetState = sheetState,
        dragHandle = null,
        shape = RectangleShape,
        containerColor = Color.Transparent,
        tonalElevation = 0.dp,
        contentWindowInsets = { WindowInsets(0) },
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .clip(shape)
                .background(BottomSheetDefaults.ContainerColor)
                .border(1.dp, MaterialTheme.colorScheme.outline, shape)
                .windowInsetsPadding(BottomSheetDefaults.windowInsets),
        ) {
            if (dragHandle != null) Box(Modifier.align(Alignment.CenterHorizontally)) { dragHandle() }
            content()
        }
    }
}
