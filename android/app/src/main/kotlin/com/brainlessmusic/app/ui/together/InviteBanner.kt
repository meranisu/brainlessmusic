package com.brainlessmusic.app.ui.together

import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.brainlessmusic.app.data.remote.dto.RoomInviteDto
import com.brainlessmusic.app.rooms.RoomInvites
import com.brainlessmusic.app.rooms.RoomLinks
import com.brainlessmusic.app.rooms.RoomSession
import com.brainlessmusic.app.ui.theme.AppIcons
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@HiltViewModel
class InviteBannerViewModel @Inject constructor(
    private val invites: RoomInvites,
    private val roomLinks: RoomLinks,
    private val session: RoomSession,
) : ViewModel() {
    /** Answered here, so the banner goes at once rather than at the next poll. */
    private val answered = MutableStateFlow(setOf<String>())

    /** The invite to show, if any: the first one not yet answered. */
    val invite: StateFlow<RoomInviteDto?> = combine(invites.pending, answered) { pending, done ->
        pending.firstOrNull { it.code !in done }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    /** Read when the banner draws: Join becomes Switch while already in a room. */
    val inRoom: Boolean get() = session.state.value.room != null

    /** Opens the room's join screen, the same as the invite's link; Listen together asks before leaving a room. */
    fun join(code: String) {
        answered.value += code
        invites.cancelNotification(code)
        roomLinks.open(code)
    }

    fun decline(code: String) {
        answered.value += code
        viewModelScope.launch { invites.decline(code) }
    }
}

/**
 * A Listen together invite inside the app, over the mini player on the tabs (A264), like the web's banner: Join, or
 * Switch rooms when already in one, and Not now, which turns it down.
 */
@Composable
fun InviteBanner(viewModel: InviteBannerViewModel = hiltViewModel()) {
    val invite by viewModel.invite.collectAsStateWithLifecycle()
    val shown = invite ?: return
    Surface(
        color = MaterialTheme.colorScheme.primaryContainer,
        contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier
                .fillMaxWidth()
                .padding(start = 16.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
        ) {
            Icon(AppIcons.headphones, contentDescription = null)
            Column(Modifier.weight(1f)) {
                Text(
                    "${shown.from.name} invited you to listen together",
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                shown.nowPlaying?.let { np ->
                    Text(
                        np.title + (np.artist?.let { " · $it" } ?: ""),
                        style = MaterialTheme.typography.bodySmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            // TextButtons keep the 48 dp touch height inside the slim bar.
            TextButton(onClick = { viewModel.decline(shown.code) }) { Text("Not now") }
            TextButton(onClick = { viewModel.join(shown.code) }) { Text(if (viewModel.inRoom) "Switch" else "Join") }
        }
    }
}
