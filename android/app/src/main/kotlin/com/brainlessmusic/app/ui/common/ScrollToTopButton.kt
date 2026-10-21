package com.brainlessmusic.app.ui.common

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import com.brainlessmusic.app.ui.theme.AppIcons
import kotlinx.coroutines.launch

/**
 * A small skin button that takes a list back to its top, shown once the first rows are scrolled away (Home and profiles,
 * owner, 2026-10-21). The skins have no up arrow, so it is their down chevron turned over.
 */
@Composable
fun ScrollToTopButton(state: LazyListState, modifier: Modifier = Modifier) {
    val scope = rememberCoroutineScope()
    val away by remember(state) { derivedStateOf { state.firstVisibleItemIndex > 1 } }
    AnimatedVisibility(away, modifier, enter = fadeIn() + scaleIn(), exit = fadeOut() + scaleOut()) {
        SkinFab(
            icon = AppIcons.arrowDown,
            description = "Back to top",
            onClick = {
                scope.launch {
                    // From far down, jump most of the way so the glide is short.
                    if (state.firstVisibleItemIndex > 10) state.scrollToItem(10)
                    state.animateScrollToItem(0)
                }
            },
            modifier = Modifier.rotate(180f),
            small = true,
        )
    }
}
