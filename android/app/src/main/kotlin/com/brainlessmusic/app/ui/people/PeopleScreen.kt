package com.brainlessmusic.app.ui.people

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.remote.dto.PersonDto
import com.brainlessmusic.app.data.repository.ProfileRepository
import com.brainlessmusic.app.ui.common.Avatar
import com.brainlessmusic.app.ui.common.LoadState
import com.brainlessmusic.app.ui.common.LoadStateContent
import com.brainlessmusic.app.ui.common.SkeletonListRows
import com.brainlessmusic.app.ui.playback.MiniPlayer
import com.brainlessmusic.app.ui.profile.ListCard
import com.brainlessmusic.app.ui.profile.formatDay
import com.brainlessmusic.app.ui.profile.loadMessage
import com.brainlessmusic.app.ui.theme.AppIcons
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class PeopleViewModel @Inject constructor(private val profile: ProfileRepository) : ViewModel() {
    private val _state = MutableStateFlow<LoadState<List<PersonDto>>>(LoadState.Loading)
    val state: StateFlow<LoadState<List<PersonDto>>> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = LoadState.Loading
            profile.people().fold(
                onSuccess = { _state.value = LoadState.Content(it) },
                onFailure = { _state.value = LoadState.Error(it.loadMessage()) },
            )
        }
    }

    fun avatarUrl(person: PersonDto): String? = profile.avatarUrl(person.id, person.avatarId)
}

/** Everyone on the server with a profile, most recently listening first (A170, A172). Guests can look too. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PeopleScreen(
    onBack: () -> Unit,
    onOpenNowPlaying: () -> Unit,
    onOpenProfile: (Int) -> Unit,
    viewModel: PeopleViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("People") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(AppIcons.back, contentDescription = "Back") } },
            )
        },
        bottomBar = { MiniPlayer(onClick = onOpenNowPlaying) },
    ) { padding ->
        LoadStateContent(
            state = state,
            onRetry = viewModel::load,
            modifier = Modifier.padding(padding),
            isEmpty = { it.isEmpty() },
            emptyMessage = "No one here yet.",
            loadingLabel = "Loading people",
            skeleton = { SkeletonListRows() },
        ) { people ->
            LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(vertical = 8.dp)) {
                item {
                    ListCard {
                        people.forEach { person ->
                            PersonRow(person, viewModel.avatarUrl(person), onClick = { onOpenProfile(person.id) })
                        }
                    }
                }
            }
        }
    }
}

/** A person as a row: picture, name, and their bio or when they last listened. Shared with search. */
@Composable
fun PersonRow(person: PersonDto, avatarUrl: String?, onClick: () -> Unit) {
    ListItem(
        leadingContent = { Avatar(url = avatarUrl, name = person.name, size = 44.dp) },
        headlineContent = { Text(person.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        supportingContent = {
            Text(
                person.bio ?: person.lastPlayedAt?.let { "Last listened ${formatDay(it)}" } ?: "Nothing played yet",
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.clickable(onClick = onClick),
    )
}
