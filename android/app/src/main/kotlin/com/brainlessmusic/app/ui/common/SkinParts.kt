package com.brainlessmusic.app.ui.common

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.navigationBars
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

/** Hit circle's mark for the playing song in a list: a small hit circle. */
@Composable
fun PlayingMarker(modifier: Modifier = Modifier) {
    Box(modifier.size(16.dp).border(3.dp, MaterialTheme.colorScheme.primary, CircleShape))
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

/** The mini player's progress along its top edge: Material's thin line. Hit circle rings the cover instead ([MiniCover]). */
@Composable
fun MiniProgress(progress: Float, modifier: Modifier = Modifier) {
    if (LocalSkin.current == Skin.STANDARD) {
        LinearProgressIndicator(progress = { progress }, modifier = modifier.fillMaxWidth().height(2.dp))
    }
}

/**
 * The mini player's cover. In Hit circle it is round with the song's progress running clockwise around it from the
 * top, like a hit circle's approach.
 */
@Composable
fun MiniCover(url: String?, progress: Float) {
    if (LocalSkin.current == Skin.STANDARD) {
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

/** Hit circle floats the mini player and the tab bar as outlined pills off the edge; Standard docks them. */
val floatingBars: Boolean
    @Composable get() = LocalSkin.current == Skin.HIT_CIRCLE

/** Bottom-bar colours: Hit circle drops Material's pill behind the selected tab; its ring ([TabIcon]) is the mark. */
@Composable
fun tabColors(): NavigationBarItemColors = when (LocalSkin.current) {
    Skin.STANDARD -> NavigationBarItemDefaults.colors()
    Skin.HIT_CIRCLE -> NavigationBarItemDefaults.colors(
        indicatorColor = Color.Transparent,
        selectedIconColor = MaterialTheme.colorScheme.primary,
        selectedTextColor = MaterialTheme.colorScheme.primary,
    )
}

/** A bottom-bar icon: Hit circle rings the selected tab's, like a circle waiting to be hit. */
@Composable
fun TabIcon(selected: Boolean, content: @Composable () -> Unit) {
    if (selected && LocalSkin.current == Skin.HIT_CIRCLE) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier.size(34.dp).border(2.5.dp, MaterialTheme.colorScheme.primary, CircleShape),
        ) { content() }
    } else {
        content()
    }
}

/**
 * A bottom sheet. Hit circle floats it off the screen's edges as an outlined card, like its mini player and tab bar;
 * Standard docks it as Material's sheet.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SkinSheet(
    onDismissRequest: () -> Unit,
    sheetState: SheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    dragHandle: @Composable (() -> Unit)? = { BottomSheetDefaults.DragHandle() },
    content: @Composable ColumnScope.() -> Unit,
) {
    if (!floatingBars) {
        ModalBottomSheet(onDismissRequest = onDismissRequest, sheetState = sheetState, dragHandle = dragHandle, content = content)
        return
    }
    val shape = RoundedCornerShape(28.dp)
    ModalBottomSheet(
        onDismissRequest = onDismissRequest,
        sheetState = sheetState,
        dragHandle = dragHandle,
        shape = shape,
        // The insets go outside the card here, so the content's own navigation-bar padding comes out as nothing.
        modifier = Modifier
            .windowInsetsPadding(WindowInsets.navigationBars)
            .padding(start = 12.dp, end = 12.dp, bottom = 12.dp)
            .border(1.dp, MaterialTheme.colorScheme.outline, shape),
        content = content,
    )
}
