package com.brainlessmusic.app.ui.artists

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import com.brainlessmusic.app.data.remote.dto.ArtistSummaryDto
import com.brainlessmusic.app.ui.common.LoadStateContent
import com.brainlessmusic.app.ui.navigation.LibraryBottomBar
import com.brainlessmusic.app.ui.navigation.Routes

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ArtistsListScreen(
    navController: NavHostController,
    onLoggedOut: () -> Unit,
    viewModel: ArtistsListViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Library") },
                actions = {
                    IconButton(onClick = viewModel::load) {
                        Icon(Icons.Filled.Refresh, contentDescription = "Refresh")
                    }
                    IconButton(onClick = { viewModel.logout(onLoggedOut) }) {
                        Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = "Log out")
                    }
                },
            )
        },
        bottomBar = { LibraryBottomBar(navController) },
    ) { padding ->
        LoadStateContent(
            state = state,
            onRetry = viewModel::load,
            modifier = Modifier.padding(padding),
            isEmpty = { it.isEmpty() },
            emptyMessage = "No artists yet — scan your library from the web app.",
        ) { artists ->
            LazyColumn(modifier = Modifier.fillMaxSize()) {
                items(artists, key = { it.id }) { artist ->
                    ArtistRow(artist, onClick = { navController.navigate(Routes.artistDetail(artist.id)) })
                }
            }
        }
    }
}

@Composable
private fun ArtistRow(artist: ArtistSummaryDto, onClick: () -> Unit) {
    ListItem(
        headlineContent = { Text(artist.name) },
        supportingContent = {
            Text(
                "${artist.albumCount} album${if (artist.albumCount == 1) "" else "s"} · ${artist.trackCount} track${if (artist.trackCount == 1) "" else "s"}",
                style = MaterialTheme.typography.bodySmall,
            )
        },
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    )
}
