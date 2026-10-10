package com.brainlessmusic.app.ui.splash

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.LinearProgressIndicator
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
import androidx.compose.ui.res.colorResource
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.brainlessmusic.app.R
import kotlinx.coroutines.delay

/**
 * Shown only when the session check outlasts the system splash (MainActivity). Same ground, same icon at the same size
 * (a 160 dp disc holding a 240 dp icon, as Android draws it), so the hand-over doesn't move. A thin bar says it is
 * still working.
 */
@Composable
fun SplashScreen(
    viewModel: StartViewModel,
    onResolved: (route: String) -> Unit,
) {
    val route by viewModel.resolvedRoute.collectAsStateWithLifecycle()

    LaunchedEffect(route) {
        route?.let(onResolved)
    }

    // Keeps a check that finishes just after the system splash from flashing a bar.
    var showProgress by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        delay(400)
        showProgress = true
    }

    Box(
        modifier = Modifier.fillMaxSize().background(colorResource(R.color.window_background)),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier.size(160.dp).clip(CircleShape).background(colorResource(R.color.splash_icon_background)),
            contentAlignment = Alignment.Center,
        ) {
            Image(
                painter = painterResource(R.drawable.ic_launcher_foreground),
                contentDescription = null,
                modifier = Modifier.requiredSize(240.dp),
            )
        }
        AnimatedVisibility(
            visible = showProgress,
            enter = fadeIn(),
            modifier = Modifier.align(Alignment.Center).padding(top = 240.dp),
        ) {
            LinearProgressIndicator(
                modifier = Modifier.width(96.dp),
                color = MaterialTheme.colorScheme.primary,
                trackColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.2f),
            )
        }
    }
}
