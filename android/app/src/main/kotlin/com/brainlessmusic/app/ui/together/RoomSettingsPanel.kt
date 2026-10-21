package com.brainlessmusic.app.ui.together

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.brainlessmusic.app.rooms.RoomSettings
import com.brainlessmusic.app.ui.common.Avatar

/** One setting: the wire name, its label, and its choices as (value, label) in the order shown. */
private data class SettingRow(val key: String, val label: String, val choices: List<Pair<Any, String>>, val read: (RoomSettings) -> Any?)

private val ANYONE_OR_HOST = listOf<Pair<Any, String>>("everyone" to "Anyone", "host" to "Host only")

private val SETTING_ROWS = listOf(
    SettingRow("turns", "Order", listOf(false to "As added", true to "Take turns")) { it.turns },
    SettingRow("shuffle", "Shuffle", listOf(false to "Off", true to "On")) { it.shuffle },
    SettingRow("repeat", "Repeat", listOf("off" to "Off", "all" to "Queue", "one" to "Song")) { it.repeat },
    SettingRow("skip", "Skipping", listOf("vote" to "Vote", "everyone" to "Anyone", "host" to "Host only")) { it.skip },
    SettingRow("playback", "Play, pause, seek", ANYONE_OR_HOST) { it.playback },
    SettingRow("add", "Add songs", ANYONE_OR_HOST) { it.add },
    SettingRow("editQueue", "Move or remove others' songs", ANYONE_OR_HOST) { it.editQueue },
    SettingRow("invite", "Invite people", ANYONE_OR_HOST) { it.invite },
)

/** The host picks; everyone else sees the same rows read-only, so they know why a control is off (A253). */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
internal fun RoomSettingsPanel(settings: RoomSettings, isHost: Boolean, onChange: (String, Any) -> Unit) {
    Panel {
        Text(
            if (isHost) "Room settings" else "Room settings (the host sets these)",
            style = MaterialTheme.typography.titleMedium,
        )
        SETTING_ROWS.forEach { row ->
            val current = row.read(settings)
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (isHost) {
                    Text(row.label, style = MaterialTheme.typography.bodyMedium)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        row.choices.forEach { (value, label) ->
                            FilterChip(
                                selected = value == current,
                                onClick = { if (value != current) onChange(row.key, value) },
                                label = { Text(label) },
                            )
                        }
                    }
                } else {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(row.label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                        Text(
                            row.choices.firstOrNull { it.first == current }?.second ?: "",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
        Text(
            when (settings.skip) {
                "everyone" -> "Anyone: Next skips at once, whoever presses it."
                "host" -> "Host only: only the host can skip."
                else -> "Vote: whoever added the song, and the host, skip at once. Anyone else's Next is a vote; " +
                    "more than half of the people here skips it (with two of you, one vote)."
            } + if (settings.turns) " Take turns plays one song from each person in turn, so songs can't be moved by hand." else "",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** Pick accounts to invite; they get a notification (A255). Guests aren't listed: they get the link. */
@Composable
internal fun InvitePanel(list: InviteList, pictureUrl: (Int, String?) -> String?, onRetry: () -> Unit, onSend: (List<Int>) -> Unit, onClose: () -> Unit) {
    var picked by remember { mutableStateOf(setOf<Int>()) }
    Panel {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Invite people", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
            TextButton(onClick = onClose) { Text("Close") }
        }
        when (list) {
            InviteList.Closed -> Unit
            InviteList.Loading -> CircularProgressIndicator()
            InviteList.Failed -> Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Couldn't load the list.", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                TextButton(onClick = onRetry) { Text("Try again") }
            }
            is InviteList.Ready -> if (list.people.isEmpty()) {
                Text(
                    "Everyone with an account is already here. Guests join with the link.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                list.people.forEach { person ->
                    val checked = person.id in picked
                    val toggle = { picked = if (checked) picked - person.id else picked + person.id }
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 48.dp)
                            .clickable(onClickLabel = if (checked) "Don't invite ${person.name}" else "Invite ${person.name}") { toggle() },
                    ) {
                        Checkbox(checked = checked, onCheckedChange = { toggle() })
                        Avatar(url = pictureUrl(person.id, person.avatarId), name = person.name, size = 32.dp)
                        Spacer(Modifier.width(12.dp))
                        Text(person.name, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
        Button(onClick = { onSend(picked.toList()) }, enabled = picked.isNotEmpty() && picked.size <= 8) {
            Text(if (picked.size > 1) "Invite ${picked.size} people" else "Send invite")
        }
    }
}

/** Whose song it is (A256): the adder's picture, named for TalkBack. */
@Composable
internal fun AddedByAvatar(name: String?, url: String?, size: androidx.compose.ui.unit.Dp = 32.dp) {
    val label = if (name.isNullOrEmpty()) "Added by someone who left" else "Added by $name"
    Avatar(url = url, name = name?.ifEmpty { "?" } ?: "?", size = size, modifier = Modifier.semantics { contentDescription = label })
}
