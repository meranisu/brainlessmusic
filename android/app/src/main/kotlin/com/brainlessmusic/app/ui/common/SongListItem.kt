package com.brainlessmusic.app.ui.common

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

/**
 * A song in a list: optional cover, title, one line under it, and its length. [onLongClick], when given, opens the
 * song's options with a haptic tick. [transparent] drops the row's own background, for lists on a patterned page.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun SongListItem(
    title: AnnotatedString,
    subtitle: AnnotatedString,
    durationSeconds: Double?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    coverUrl: String? = null,
    showCover: Boolean = false,
    transparent: Boolean = false,
    onLongClick: (() -> Unit)? = null,
) {
    val haptics = LocalHapticFeedback.current
    ListItem(
        leadingContent = if (showCover) {
            { CoverImage(coverUrl, contentDescription = null, modifier = Modifier.size(44.dp)) }
        } else {
            null
        },
        headlineContent = { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        supportingContent = {
            Text(subtitle, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall)
        },
        trailingContent = { Text(formatDuration(durationSeconds), style = MaterialTheme.typography.bodySmall) },
        colors = if (transparent) ListItemDefaults.colors(containerColor = Color.Transparent) else ListItemDefaults.colors(),
        modifier = modifier.fillMaxWidth().combinedClickable(
            onClick = onClick,
            onLongClickLabel = onLongClick?.let { "Song options" },
            onLongClick = onLongClick?.let { longClick ->
                {
                    haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                    longClick()
                }
            },
        ),
    )
}
