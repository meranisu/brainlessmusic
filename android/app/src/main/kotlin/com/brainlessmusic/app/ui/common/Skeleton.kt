package com.brainlessmusic.app.ui.common

import android.provider.Settings
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import com.brainlessmusic.app.ui.theme.coverShape

/** Varied so a column of bars reads as names of different lengths, not a stack of identical stripes. */
private val TitleFractions = listOf(0.4f, 0.6f, 0.33f, 0.5f, 0.66f, 0.25f, 0.42f, 0.58f)
private val MetaWidths = listOf(96.dp, 64.dp, 80.dp, 112.dp)

/** The web's 0.4 s beat: one breath is four beats, the same 1.6 s pulse as `.skeleton` in `index.css`. */
private const val BEAT_MS = 400

/**
 * The loading state for a screen, shaped like what is coming (A59). Held back 300 ms so a fast load never flashes
 * it, then fades in. With animations off in the system settings it neither pulses nor fades. TalkBack reads [label];
 * the blocks themselves are hidden from it.
 */
@Composable
fun Skeleton(label: String, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val context = LocalContext.current
    val animationsOn = remember {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0f
    }
    var shown by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        delay(300)
        shown = true
    }
    val reveal by animateFloatAsState(
        targetValue = if (shown) 1f else 0f,
        animationSpec = if (animationsOn) tween(150) else tween(0),
        label = "skeleton-reveal",
    )
    // The pulse is the "still working" signal, so it lives only as long as this composable, which the data replaces.
    val pulse = if (animationsOn) {
        rememberInfiniteTransition(label = "skeleton-pulse").animateFloat(
            initialValue = 1f,
            targetValue = 0.45f,
            animationSpec = infiniteRepeatable(tween(BEAT_MS * 2, easing = FastOutSlowInEasing), RepeatMode.Reverse),
            label = "alpha",
        ).value
    } else {
        1f
    }
    Box(
        modifier = modifier
            .fillMaxSize()
            .graphicsLayer { alpha = reveal * pulse }
            .clearAndSetSemantics {
                contentDescription = label
                liveRegion = LiveRegionMode.Polite
            },
    ) {
        content()
    }
}

/** One placeholder bar or tile. `outlineVariant` sits one step off the background in every scheme, light included. */
@Composable
fun SkeletonBlock(modifier: Modifier = Modifier, shape: Shape = RoundedCornerShape(4.dp)) {
    Box(modifier.clip(shape).background(MaterialTheme.colorScheme.outlineVariant))
}

/** What sits before a skeleton row's text, matching the real row it stands in for. */
enum class SkeletonLead { NONE, NUMBER, COVER }

/**
 * Two-line list rows at a `ListItem`'s 72 dp, so the real rows land where the bars were. Not scrollable: it only
 * fills the screen until the data arrives.
 */
@Composable
fun SkeletonListRows(
    modifier: Modifier = Modifier,
    rows: Int = 12,
    lead: SkeletonLead = SkeletonLead.NONE,
    trailing: Boolean = false,
    contentPadding: PaddingValues = PaddingValues(0.dp),
    header: (@Composable () -> Unit)? = null,
) {
    LazyColumn(modifier = modifier.fillMaxSize(), contentPadding = contentPadding, userScrollEnabled = false) {
        if (header != null) item { header() }
        items(rows) { i -> SkeletonRow(i, lead, trailing) }
    }
}

@Composable
private fun SkeletonRow(index: Int, lead: SkeletonLead, trailing: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(72.dp)
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        when (lead) {
            SkeletonLead.NONE -> Unit
            SkeletonLead.NUMBER -> {
                SkeletonBlock(Modifier.size(width = 14.dp, height = 12.dp))
                Spacer(Modifier.width(16.dp))
            }
            SkeletonLead.COVER -> {
                SkeletonBlock(Modifier.size(40.dp), coverShape(8.dp))
                Spacer(Modifier.width(16.dp))
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SkeletonBlock(Modifier.fillMaxWidth(TitleFractions[index % TitleFractions.size]).height(14.dp))
            SkeletonBlock(Modifier.width(MetaWidths[index % MetaWidths.size]).height(10.dp))
        }
        if (trailing) {
            Spacer(Modifier.width(16.dp))
            SkeletonBlock(Modifier.size(width = 32.dp, height = 10.dp))
        }
    }
}

/** Matches the album grids (Library and artist pages): same adaptive columns, square cover, two lines. */
@Composable
fun SkeletonAlbumGrid(
    modifier: Modifier = Modifier,
    count: Int = 12,
    contentPadding: PaddingValues = PaddingValues(12.dp),
) {
    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = 140.dp),
        modifier = modifier.fillMaxSize(),
        contentPadding = contentPadding,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        userScrollEnabled = false,
    ) {
        items(count) { i ->
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                SkeletonBlock(Modifier.fillMaxWidth().aspectRatio(1f), coverShape(8.dp))
                SkeletonBlock(Modifier.fillMaxWidth(if (i % 2 == 0) 0.5f else 0.75f).height(12.dp))
                SkeletonBlock(Modifier.fillMaxWidth(if (i % 3 == 0) 0.66f else 0.4f).height(10.dp))
            }
        }
    }
}

/** The album page's header: cover on the left, title, artist and year beside it. */
@Composable
fun SkeletonAlbumHeader(coverSize: Dp = 88.dp) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SkeletonBlock(Modifier.size(coverSize), coverShape(8.dp))
        Column(Modifier.padding(start = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            SkeletonBlock(Modifier.width(180.dp).height(20.dp))
            SkeletonBlock(Modifier.width(120.dp).height(12.dp))
            SkeletonBlock(Modifier.width(40.dp).height(10.dp))
        }
    }
}
