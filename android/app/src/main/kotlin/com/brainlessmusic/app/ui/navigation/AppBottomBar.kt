package com.brainlessmusic.app.ui.navigation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState
import com.brainlessmusic.app.data.remote.NetworkMonitor
import com.brainlessmusic.app.ui.playback.MiniPlayer
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject
import com.brainlessmusic.app.ui.theme.AppIcons

@HiltViewModel
class ConnectivityViewModel @Inject constructor(networkMonitor: NetworkMonitor) : ViewModel() {
    val online: StateFlow<Boolean> = networkMonitor.online
}

/**
 * The mini player stacked on the navigation bar, for the top-level tabs. [onReselect]: the current tab tapped again.
 * With no signal an offline line sits on top, pointing at Downloads from every other tab.
 */
@Composable
fun AppBottomBar(
    navController: NavHostController,
    onReselect: () -> Unit = {},
    connectivity: ConnectivityViewModel = hiltViewModel(),
) {
    val online by connectivity.online.collectAsStateWithLifecycle()
    val route = navController.currentBackStackEntryAsState().value?.destination?.route
    Column {
        if (!online) {
            OfflineBanner(
                onOpenDownloads = if (route == Routes.DOWNLOADS) null else {
                    { navController.navigate(Routes.DOWNLOADS) { popUpTo(Routes.HOME); launchSingleTop = true } }
                },
            )
        }
        MiniPlayer(onClick = { navController.openNowPlaying() }, extendUnderSystemBar = false)
        LibraryBottomBar(navController, onReselect)
    }
}

@Composable
private fun OfflineBanner(onOpenDownloads: (() -> Unit)?) {
    Surface(color = MaterialTheme.colorScheme.secondaryContainer, contentColor = MaterialTheme.colorScheme.onSecondaryContainer) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 16.dp, end = 8.dp, top = 4.dp, bottom = 4.dp),
        ) {
            Icon(AppIcons.cloudOff, contentDescription = null)
            Text(
                if (onOpenDownloads != null) "You're offline." else "You're offline. Downloads still play.",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier
                    .padding(start = 12.dp)
                    .weight(1f),
            )
            // A TextButton keeps the 48 dp touch height even inside the slim bar.
            onOpenDownloads?.let { TextButton(onClick = it) { Text("Downloads") } }
        }
    }
}
