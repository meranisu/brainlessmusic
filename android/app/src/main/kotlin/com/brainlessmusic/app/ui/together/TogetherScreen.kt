package com.brainlessmusic.app.ui.together

import android.content.Intent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.brainlessmusic.app.playback.PlaybackUiState
import com.brainlessmusic.app.rooms.RoomConnection
import com.brainlessmusic.app.rooms.RoomLinks
import com.brainlessmusic.app.rooms.RoomMember
import com.brainlessmusic.app.rooms.RoomUiState
import com.brainlessmusic.app.ui.common.CoverImage
import com.brainlessmusic.app.ui.theme.AppIcons
import com.brainlessmusic.app.ui.theme.accentInk
import com.brainlessmusic.app.ui.theme.cardShape
import com.brainlessmusic.app.ui.theme.coverShape
import com.brainlessmusic.app.ui.theme.tileShape

/**
 * "Listen together" (A102): start a room, join one by its code, or, inside one, the code to pass on, who's in and the
 * way out. The queue itself is edited from the player's queue sheet, which sends room commands while in a room.
 * The code is six letter tiles in the skin's tile shape, typed into and shown the same way, like an arcade's name entry.
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
                        Icon(AppIcons.back, contentDescription = "Back")
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

/**
 * The code as six tiles. [cursor] lights the tile the next letter goes in (typing only); typed letters sit in tiles
 * edged in the text colour, empty ones are faint. Capped in width so the tiles stay letter-shaped on a wide screen.
 */
@Composable
private fun CodeTiles(code: String, cursor: Int?, modifier: Modifier = Modifier) {
    val scheme = MaterialTheme.colorScheme
    Row(modifier.widthIn(max = 360.dp).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        repeat(RoomLinks.CODE_LENGTH) { i ->
            val letter = code.getOrNull(i)
            val shape = tileShape(10.dp)
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .weight(1f)
                    .aspectRatio(0.8f)
                    .clip(shape)
                    .background(scheme.surface)
                    .border(
                        width = 2.dp,
                        color = when {
                            i == cursor -> scheme.primary
                            letter != null -> scheme.onSurfaceVariant
                            else -> scheme.outlineVariant
                        },
                        shape = shape,
                    ),
            ) {
                Text(
                    letter?.toString() ?: "",
                    style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.ExtraBold),
                    color = scheme.onSurface,
                )
            }
        }
    }
}

/** The tiles as a text field: the real field is invisible on top, so the keyboard, paste and talkback all work. */
@Composable
private fun CodeEntry(code: String, onChange: (String) -> Unit, onGo: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    BasicTextField(
        value = code,
        onValueChange = onChange,
        singleLine = true,
        interactionSource = interaction,
        cursorBrush = SolidColor(MaterialTheme.colorScheme.primary.copy(alpha = 0f)),
        keyboardOptions = KeyboardOptions(
            capitalization = KeyboardCapitalization.Characters,
            autoCorrectEnabled = false,
            imeAction = ImeAction.Go,
        ),
        keyboardActions = KeyboardActions(onGo = { onGo() }),
        modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Room code, six letters" },
        decorationBox = { inner ->
            Box {
                CodeTiles(
                    code = code,
                    cursor = if (focused) code.length.coerceAtMost(RoomLinks.CODE_LENGTH - 1) else null,
                    modifier = Modifier.clearAndSetSemantics {},
                )
                Box(Modifier.alpha(0f)) { inner() }
            }
        },
    )
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

    // Joining first, and the larger panel: it's what everyone but the host does.
    Panel {
        PanelTitle("Join with a code")
        Text(
            "Six letters, from whoever started the room.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        CodeEntry(code = code, onChange = viewModel::onCodeChange, onGo = viewModel::join)
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
        Button(onClick = viewModel::join, enabled = lookup is RoomLookup.Found, modifier = Modifier.fillMaxWidth()) {
            Text("Join")
        }
    }

    // Starting is the smaller act: one row with what the room would start from, not a second panel like the first.
    val current = playback.current
    val songs = playback.queue.size
    Surface(
        shape = MaterialTheme.cardShape,
        color = MaterialTheme.colorScheme.surfaceContainer,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                if (current != null) CoverImage(current.coverUrl, contentDescription = null, modifier = Modifier.size(48.dp))
                Column(Modifier.weight(1f)) {
                    Text("Start a room", style = MaterialTheme.typography.titleSmall)
                    Text(
                        if (current != null) {
                            "From \"${current.title}\", ${if (songs == 1) "one song" else "$songs songs"} in the queue."
                        } else {
                            "With an empty queue. Once you're in, Play on any song adds it."
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                OutlinedButton(onClick = viewModel::start, enabled = !starting) {
                    Text(if (starting) "Starting…" else "Start")
                }
            }
            startError?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error) }
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
    val switchTo by viewModel.switchTo.collectAsStateWithLifecycle()

    switchTo?.let { code ->
        // Already in a room: the link's room is offered, not joined, so nobody is pulled out of one unasked.
        Panel(Modifier.semantics { liveRegion = LiveRegionMode.Polite }) {
            Text("The link was for room $code. Switching leaves this one.", style = MaterialTheme.typography.bodyMedium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = viewModel::switchRooms) { Text("Switch rooms") }
                TextButton(onClick = viewModel::keepRoom) { Text("Stay here") }
            }
        }
    }

    // The code is the screen's focal point in a room: it's what the others need.
    Panel {
        Text("Room code", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        CodeTiles(
            code = room.code,
            cursor = null,
            // Read out letter by letter.
            modifier = Modifier.clearAndSetSemantics { contentDescription = "Room code ${room.code.toList().joinToString(" ")}" },
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
                    // The link opens the app where it's installed and the web player's join page where it isn't.
                    putExtra(Intent.EXTRA_TEXT, "Listen with me on brainlessmusic: ${RoomLinks.linkFor(room.code)}")
                }
                context.startActivity(Intent.createChooser(send, "Share the room"))
            }) { Text("Share link") }
            OutlinedButton(onClick = viewModel::leave) { Text("Leave room") }
            if (state.isHost) {
                TextButton(
                    onClick = { confirmEnd = true },
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
                ) { Text("End room") }
            }
        }
    }

    NowPlayingCard(state, viewModel, canOpen = playback.hasQueue, onOpen = onOpenNowPlaying)

    Panel {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("In the room", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            Text(
                "${room.members.size} of 8",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        room.members.forEach { member ->
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

/** What the room is on, with its cover; the whole card opens the player, where the room's queue is edited. */
@Composable
private fun NowPlayingCard(state: RoomUiState, viewModel: TogetherViewModel, canOpen: Boolean, onOpen: () -> Unit) {
    val room = state.room ?: return
    val entry = room.currentEntry
    val after = room.queue.size - room.current - 1
    val content: @Composable () -> Unit = {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.padding(12.dp),
        ) {
            if (entry != null) {
                CoverImage(viewModel.coverUrl(entry.trackId), contentDescription = null, modifier = Modifier.size(64.dp))
            }
            Column(Modifier.weight(1f)) {
                Text("Now playing", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (entry == null) {
                    Text("Nothing yet. Play on any song adds it to the room.", style = MaterialTheme.typography.bodyMedium)
                } else {
                    Text(entry.title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        entry.artist ?: "Unknown Artist",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
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
            }
            if (canOpen) Icon(AppIcons.queue, contentDescription = null, tint = MaterialTheme.accentInk)
        }
    }
    val shape = MaterialTheme.cardShape
    val color = MaterialTheme.colorScheme.surfaceContainer
    val border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
    if (canOpen) {
        Surface(
            onClick = onOpen,
            shape = shape,
            color = color,
            border = border,
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = "Open the player and queue" },
        ) { content() }
    } else {
        Surface(shape = shape, color = color, border = border, modifier = Modifier.fillMaxWidth()) { content() }
    }
}

@Composable
private fun MemberRow(member: RoomMember, isYou: Boolean, isHost: Boolean, canRemove: Boolean, onRemove: () -> Unit) {
    val scheme = MaterialTheme.colorScheme
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.heightIn(min = 48.dp)) {
        // An initial in the skin's avatar shape; the host's is edged in the accent, someone away is dimmed.
        val avatar = coverShape(10.dp)
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(40.dp)
                .alpha(if (member.connected) 1f else 0.5f)
                .clip(avatar)
                .background(scheme.surfaceContainerHighest)
                .border(2.dp, if (isHost) scheme.primary else scheme.outlineVariant, avatar),
        ) {
            Text(
                member.name.firstOrNull()?.uppercase() ?: "?",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                color = scheme.onSurface,
            )
        }
        Spacer(Modifier.width(12.dp))
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
                    color = if (!member.connected) MaterialTheme.accentInk else scheme.onSurfaceVariant,
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
