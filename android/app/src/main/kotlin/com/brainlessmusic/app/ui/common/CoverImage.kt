package com.brainlessmusic.app.ui.common

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Album
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImagePainter
import coil.compose.rememberAsyncImagePainter

/**
 * A cover-art thumbnail that always renders *something* — a plain disc icon
 * on a `null` URL (no active session yet), a load failure, or while loading
 * — rather than empty space, matching every other "art or placeholder" spot
 * in the project (see the web app's `library-player.html` cover fallback).
 */
@Composable
fun CoverImage(
    url: String?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
    cornerRadius: Dp = 8.dp,
) {
    val painter = rememberAsyncImagePainter(model = url)
    val showImage = url != null && painter.state !is AsyncImagePainter.State.Error

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(cornerRadius))
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        if (showImage) {
            Image(
                painter = painter,
                contentDescription = contentDescription,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Icon(
                imageVector = Icons.Filled.Album,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
