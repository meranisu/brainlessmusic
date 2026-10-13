package com.brainlessmusic.app.ui.common

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImagePainter
import coil.compose.rememberAsyncImagePainter
import com.brainlessmusic.app.ui.theme.DisplayFontFamily
import com.brainlessmusic.app.ui.theme.coverShape

/**
 * Someone's profile picture (A167), or their initial on the accent tile when there is none or it fails to load. The
 * skin's cover shape, so it sits with the covers around it (round in Hit circle, cut in Lane and Gear).
 */
@Composable
fun Avatar(url: String?, name: String, size: Dp, modifier: Modifier = Modifier) {
    val painter = rememberAsyncImagePainter(model = url)
    val showImage = url != null && painter.state !is AsyncImagePainter.State.Error
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .size(size)
            .clip(coverShape(size / 5))
            .background(MaterialTheme.colorScheme.primaryContainer),
    ) {
        if (showImage) {
            Image(painter = painter, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        } else {
            Text(
                name.trim().firstOrNull()?.uppercase() ?: "?",
                fontFamily = DisplayFontFamily,
                fontWeight = FontWeight.ExtraBold,
                fontSize = (size.value * 0.45f).sp,
                color = MaterialTheme.colorScheme.onPrimaryContainer,
            )
        }
    }
}
