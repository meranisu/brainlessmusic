package com.brainlessmusic.app.ui.common

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * The web app's ringed mark: an outline circle with an accent dot in the middle that breathes.
 * Drawn, not an image, so it scales cleanly and takes any colors.
 */
@Composable
fun BrandMark(ringColor: Color, dotColor: Color, size: Dp, animate: Boolean = true, modifier: Modifier = Modifier) {
    val pulse = if (animate) {
        rememberInfiniteTransition(label = "brand-pulse").animateFloat(
            initialValue = 0.82f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(tween(800, easing = LinearEasing), RepeatMode.Reverse),
            label = "dot",
        ).value
    } else {
        1f
    }
    Canvas(modifier = modifier.size(size)) {
        val stroke = this.size.minDimension * 0.09f
        drawCircle(
            color = ringColor,
            radius = (this.size.minDimension - stroke) / 2,
            center = Offset(this.size.width / 2, this.size.height / 2),
            style = Stroke(width = stroke),
        )
        drawCircle(
            color = dotColor,
            radius = this.size.minDimension * 0.21f * pulse,
            center = Offset(this.size.width / 2, this.size.height / 2),
        )
    }
}

