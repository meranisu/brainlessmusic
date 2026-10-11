package com.brainlessmusic.app.ui.together

import android.content.Intent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.brainlessmusic.app.playback.PlaybackUiState
import com.brainlessmusic.app.rooms.RoomConnection
import com.brainlessmusic.app.rooms.RoomMember
import com.brainlessmusic.app.rooms.RoomUiState
import com.brainlessmusic.app.ui.theme.accentInk
import com.brainlessmusic.app.ui.theme.tileShape

/**
 * "Listen together" (A102): start a room, join one by its code, or, inside one, the code to pass on, who's in and the
 * way out. The queue itself is edited from the player's queue sheet, which sends room commands while in a room.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TogetherScreen(
    onBack: () -> Unit,
    onOpenNowPlaying: () -> Unit,
    viewModel: TogetherViewModel = hiltViewModel(),
) {
    val room by viewModel.room.collectAsStateWithLifecycle()
    val playback by viewModel.playback.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Listen together") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                "Everyone in a room hears the same song at the same moment, wherever they are." +
                    if (viewModel.isGuest) " Guests can join and use every control." else "",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            val current = room.room
            when {
                current != null -> InsideRoom(room, playback, viewModel, onOpenNowPlaying)
                room.joining -> Joining(onStop = viewModel::leave)
                else -> OutsideRoom(playback, viewModel)
            }
        }
    }
}

@Composable
private fun Panel(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Surface(
        shape = tileShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceContainer,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp), content = content)
    }
}

@Composable
private fun PanelTitle(text: String) {
    Text(text, style = MaterialTheme.typography.titleMedium)
}

@Composable
private fun Joining(onStop: () -> Unit) {
    // Retries until the server answers, so this can last if the server is down: Stop gets back out.
    Panel(Modifier.semantics { liveRegion = LiveRegionMode.Polite }) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
            Text(
                "Joining the room… If this takes long, the server may be down.",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f).padding(start = 12.dp),
            )
        }
        OutlinedButton(onClick = onStop) { Text("Stop") }
    }
}

@Composable
private fun OutsideRoom(playback: PlaybackUiState, viewModel: TogetherViewModel) {
    val code by viewModel.code.collectAsStateWithLifecycle()
    val lookup by viewModel.lookup.collectAsStateWithLifecycle()
    val starting by viewModel.starting.collectAsStateWithLifecycle()
    val startError by viewModel.startError.collectAsStateWithLifecycle()

    // Joining first: it's what everyone but the host does.
    Panel {
        PanelTitle("Join with a code")
        Text("Six letters, from whoever started the room.", style = MaterialTheme.typography.bodyMedium)
        OutlinedTextField(
            value = code,
            onValueChange = viewModel::onCodeChange,
            placeholder = { Text("ABCDEF", letterSpacing = 6.sp) },
            singleLine = true,
            // Wide spacing and capitals: it's a code, read letter by letter.
            textStyle = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.ExtraBold, letterSpacing = 6.sp),
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Characters,
                autoCorrectEnabled = false,
                imeAction = ImeAction.Go,
            ),
            keyboardActions = KeyboardActions(onGo = { viewModel.join() }),
            modifier = Modifier.width(240.dp).semantics { contentDescription = "Room code" },
        )
        Text(
            when (val l = lookup) {
                RoomLookup.Idle -> ""
                RoomLookup.Looking -> "Looking for that room…"
                RoomLookup.Missing -> "No room with that code. Check the letters with the host."
                RoomLookup.Failed -> "Couldn't check that code. Try again in a moment."
                is RoomLookup.Found -> previewLine(l.room.members, l.room.nowPlaying?.title, l.room.nowPlaying?.artist)
            },
            style = MaterialTheme.typography.bodyMedium,
            color = when (lookup) {
                RoomLookup.Missing, RoomLookup.Failed -> MaterialTheme.colorScheme.error
                else -> MaterialTheme.colorScheme.onSurface
            },
            modifier = Modifier.heightIn(min = 20.dp).semantics { liveRegion = LiveRegionMode.Polite },
        )
        Button(onClick = viewModel::join, enabled = lookup is RoomLookup.Found) { Text("Join") }
    }

    Panel {
        PanelTitle("Start a room")
        val current = playback.current
        val songs = playback.queue.size
        Text(
            if (current != null) {
                "Starts from what you're playing: \"${current.title}\", ${if (songs == 1) "one song" else "$songs songs"} in the queue."
            } else {
                "Starts with an empty queue. Once you're in, Play on any song adds it."
            },
            style = MaterialTheme.typography.bodyMedium,
        )
        startError?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error) }
        OutlinedButton(onClick = viewModel::start, enabled = !starting) {
            Text(if (starting) "Starting…" else "Start a room")
        }
    }
}

private fun previewLine(members: List<String>, title: String?, artist: String?): String {
    val who = "${members.joinToString(", ")} ${if (members.size == 1) "is" else "are"} in"
    return if (title == null) "$who, nothing playing yet." else "$who, listening to \"$title\"" + (artist?.let { " by $it" } ?: "") + "."
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun InsideRoom(
    state: RoomUiState,
    playback: PlaybackUiState,
    viewModel: TogetherViewModel,
    onOpenNowPlaying: () -> Unit,
) {
    val room = state.room ?: return
    val context = LocalContext.current
    var confirmEnd by remember { mutableStateOf(false) }

    Panel {
        Text("Room code", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            room.code,
            style = MaterialTheme.typography.displaySmall.copy(fontWeight = FontWeight.ExtraBold, letterSpacing = 8.sp),
            // Read out letter by letter.
            modifier = Modifier.semantics { contentDescription = "Room code ${room.code.toList().joinToString(" ")}" },
        )
        Text(
            if (state.connection == RoomConnection.LIVE) "In step with the room." else "Reconnecting… the music carries on here.",
            style = MaterialTheme.typography.bodyMedium,
            color = if (state.connection == RoomConnection.LIVE) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.accentInk,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        )
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Button(onClick = {
                val send = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, "Listen with me on brainlessmusic. Room code: ${room.code}")
                }
                context.startActivity(Intent.createChooser(send, "Share the room code"))
            }) { Text("Share code") }
            OutlinedButton(onClick = viewModel::leave) { Text("Leave room") }
            if (state.isHost) {
                TextButton(
                    onClick = { confirmEnd = true },
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) { Text("End room") }
            }
        }
    }

    Panel {
        PanelTitle("Now playing")
        val entry = room.currentEntry
        if (entry == null) {
            Text("Nothing yet. Play on any song adds it to the room.", style = MaterialTheme.typography.bodyMedium)
        } else {
            Text(entry.title, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                entry.artist ?: "Unknown Artist",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            val after = room.queue.size - room.current - 1
            Text(
                when (after) {
                    0 -> "Nothing after this. Play on any song adds it after the current one."
                    1 -> "One more song in the queue."
                    else -> "$after more songs in the queue."
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (playback.hasQueue) {
            OutlinedButton(onClick = onOpenNowPlaying) { Text("Open the player and queue") }
        }
    }

    Panel {
        PanelTitle("In the room (${room.members.size} of 8)")
        room.members.forEachIndexed { index, member ->
            if (index > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            MemberRow(
                member = member,
                isYou = member.userId == state.you,
                isHost = member.userId == room.hostUserId,
                canRemove = state.isHost && member.userId != state.you,
                onRemove = { viewModel.kick(member.userId) },
            )
        }
        Text(
            "Anyone here can pause, skip and change the queue. Away means their connection dropped; they're kept for 2 minutes.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }

    if (confirmEnd) {
        AlertDialog(
            onDismissRequest = { confirmEnd = false },
            title = { Text("End the room for everyone?") },
            text = { Text("Everyone keeps playing the queue on their own, from where the room was.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmEnd = false
                        viewModel.end()
                    },
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) { Text("End for everyone") }
            },
            dismissButton = { TextButton(onClick = { confirmEnd = false }) { Text("Keep it") } },
        )
    }
}

@Composable
private fun MemberRow(member: RoomMember, isYou: Boolean, isHost: Boolean, canRemove: Boolean, onRemove: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.heightIn(min = 48.dp)) {
        Column(Modifier.weight(1f)) {
            Text(
                member.name + if (isYou) " (you)" else "",
                style = MaterialTheme.typography.bodyLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            val tags = listOfNotNull(
                "Host".takeIf { isHost },
                "Guest".takeIf { member.kind == "guest" },
                "Away".takeIf { !member.connected },
            )
            if (tags.isNotEmpty()) {
                Text(
                    tags.joinToString(" · "),
                    style = MaterialTheme.typography.labelMedium,
                    color = if (!member.connected) MaterialTheme.accentInk else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        if (canRemove) {
            Spacer(Modifier.width(8.dp))
            TextButton(
                onClick = onRemove,
                modifier = Modifier.semantics { contentDescription = "Remove ${member.name} from the room" },
            ) { Text("Remove") }
        }
    }
}
