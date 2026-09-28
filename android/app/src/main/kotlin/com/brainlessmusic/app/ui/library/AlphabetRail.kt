package com.brainlessmusic.app.ui.library

import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.brainlessmusic.app.data.remote.dto.LetterEntryDto

/**
 * The A–Z strip down the right edge of a long list: tap or drag along it and the list jumps to that letter
 * at once, with a large letter shown while a finger is down. [letters] comes from `GET /browse/letters`, so
 * a jump lands on the right row even though most of the list has not been loaded yet. Letters with nothing
 * under them are dimmed but still jump (to where they would be).
 *
 * The root fills the area but draws only the strip and the bubble and takes no touches itself, so the list
 * underneath keeps scrolling normally. [topInset] keeps the strip clear of the floating tab bar.
 */
@Composable
fun AlphabetRail(
    letters: List<LetterEntryDto>,
    firstVisibleIndex: Int,
    onJump: (offset: Int) -> Unit,
    modifier: Modifier = Modifier,
    topInset: Dp = 0.dp,
) {
    if (letters.isEmpty()) return

    // The last non-empty letter that starts at or before the row at the top of the list.
    val current = letters.lastOrNull { it.count > 0 && it.offset <= firstVisibleIndex }?.letter
    var pressed by remember { mutableStateOf<String?>(null) }
    var heightPx by remember { mutableIntStateOf(1) }
    var lastJump by remember { mutableIntStateOf(-1) }
    val haptic = LocalHapticFeedback.current

    fun jumpTo(y: Float) {
        val index = (y / heightPx * letters.size).toInt().coerceIn(0, letters.lastIndex)
        if (index == lastJump) return
        lastJump = index
        pressed = letters[index].letter
        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        onJump(letters[index].offset)
    }

    fun release() {
        pressed = null
        lastJump = -1
    }

    Box(modifier = modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .align(Alignment.CenterEnd)
                .padding(top = topInset, bottom = 8.dp)
                .fillMaxHeight()
                .width(28.dp)
                .onSizeChanged { heightPx = it.height.coerceAtLeast(1) }
                .pointerInput(letters) {
                    detectTapGestures(onPress = { offset ->
                        jumpTo(offset.y)
                        tryAwaitRelease()
                        release()
                    })
                }
                .pointerInput(letters) {
                    detectVerticalDragGestures(
                        onDragStart = { jumpTo(it.y) },
                        onDragEnd = ::release,
                        onDragCancel = ::release,
                    ) { change, _ -> jumpTo(change.position.y) }
                },
            verticalArrangement = Arrangement.SpaceEvenly,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            letters.forEach { entry ->
                val highlighted = entry.letter == (pressed ?: current)
                Text(
                    entry.letter,
                    fontSize = 10.sp,
                    fontWeight = if (highlighted) FontWeight.Bold else FontWeight.Medium,
                    color = when {
                        highlighted -> MaterialTheme.colorScheme.primary
                        entry.count == 0 -> MaterialTheme.colorScheme.onSurface.copy(alpha = 0.28f)
                        else -> MaterialTheme.colorScheme.onSurfaceVariant
                    },
                )
            }
        }

        pressed?.let { letter ->
            Surface(
                shape = CircleShape,
                color = MaterialTheme.colorScheme.primaryContainer,
                contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                shadowElevation = 6.dp,
                modifier = Modifier.align(Alignment.Center).size(84.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(letter, fontSize = 40.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
