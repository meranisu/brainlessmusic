package com.brainlessmusic.app.ui.profile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.brainlessmusic.app.data.remote.dto.SmartPreviewDto
import com.brainlessmusic.app.data.remote.dto.SmartRulesDto
import com.brainlessmusic.app.ui.common.SkinSheet
import com.brainlessmusic.app.ui.theme.AppIcons
import com.brainlessmusic.app.ui.theme.cardShape
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Wait after the last edit before asking the server what the rules pick. */
private const val PREVIEW_DELAY_MS = 400L

/** Songs listed under the count before "and N more". */
private const val PREVIEW_ROWS = 5

private sealed interface PreviewState {
    data object Idle : PreviewState
    data object Loading : PreviewState
    data class Ready(val preview: SmartPreviewDto) : PreviewState
    data object Failed : PreviewState
}

/**
 * Makes a smart playlist, or changes the rules of one (A207). Each rule is a sentence you fill in; under them, the
 * server's answer to "what would this pick right now" for you, so a rule that picks nothing shows before you save.
 * The web editor (`SmartPlaylistEditor.tsx`) is the same dialog.
 *
 * [takenNames] set means a new playlist, so a name is asked for; null means only the rules change. [onSave] gets the
 * name (blank when not asked for) and the rules, and answers a line to show if it failed, or null when it worked.
 */
@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
fun SmartPlaylistSheet(
    title: String,
    confirmLabel: String,
    initial: RulesDraft,
    takenNames: List<String>?,
    onPreview: suspend (SmartRulesDto) -> Result<SmartPreviewDto>,
    onSave: suspend (name: String, rules: SmartRulesDto) -> String?,
    onDismiss: () -> Unit,
) {
    var draft by remember { mutableStateOf(initial) }
    var name by remember { mutableStateOf("") }
    var saving by remember { mutableStateOf(false) }
    var failure by remember { mutableStateOf<String?>(null) }
    var retry by remember { mutableIntStateOf(0) }
    var preview by remember { mutableStateOf<PreviewState>(PreviewState.Idle) }
    val scope = rememberCoroutineScope()

    val check = checkSmartRules(draft)
    val nameCheck = takenNames?.let { checkPlaylistName(name, it) }
    val canSave = check is SmartRulesCheck.Ok && (nameCheck == null || nameCheck.canSave) && !saving

    LaunchedEffect(check, retry) {
        val ok = check as? SmartRulesCheck.Ok
        if (ok == null) {
            preview = PreviewState.Idle
            return@LaunchedEffect
        }
        delay(PREVIEW_DELAY_MS)
        preview = PreviewState.Loading
        preview = onPreview(ok.rules).fold(onSuccess = { PreviewState.Ready(it) }, onFailure = { PreviewState.Failed })
    }

    fun edit(change: (RulesDraft) -> RulesDraft) {
        failure = null
        draft = change(draft)
    }

    SkinSheet(onDismissRequest = { if (!saving) onDismiss() }) {
        Column(
            Modifier.weight(1f, fill = false).imePadding().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            Text(
                "It fills itself each time you open it, from your own plays and likes. Nobody else sees it.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            if (nameCheck != null) {
                OutlinedTextField(
                    value = name,
                    onValueChange = {
                        name = it
                        failure = null
                    },
                    label = { Text("Name") },
                    placeholder = { Text("Like “Not played in a while”") },
                    singleLine = true,
                    isError = nameCheck.error != null,
                    supportingText = {
                        Text(
                            nameCheck.error ?: nameCheck.warning ?: "",
                            color = if (nameCheck.error != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    },
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("Songs that match", style = MaterialTheme.typography.bodyLarge, modifier = Modifier.align(Alignment.CenterVertically))
                FilterChip(selected = draft.matchAll, onClick = { edit { it.copy(matchAll = true) } }, label = { Text("all") })
                FilterChip(selected = !draft.matchAll, onClick = { edit { it.copy(matchAll = false) } }, label = { Text("any") })
                Text("of these rules", style = MaterialTheme.typography.bodyLarge, modifier = Modifier.align(Alignment.CenterVertically))
            }

            draft.rows.forEachIndexed { index, row ->
                RuleRow(
                    number = index + 1,
                    row = row,
                    canRemove = draft.rows.size > 1,
                    onChange = { changed -> edit { d -> d.copy(rows = d.rows.map { if (it.id == row.id) changed else it }) } },
                    onRemove = { edit { d -> d.copy(rows = d.rows.filter { it.id != row.id }) } },
                )
            }

            TextButton(
                onClick = { edit { it.copy(rows = it.rows + newRuleRow(SmartField.MY_PLAYS, "lt", "3")) } },
                enabled = draft.rows.size < MAX_SMART_RULES,
            ) {
                Icon(AppIcons.add, contentDescription = null, modifier = Modifier.size(18.dp))
                Text(
                    if (draft.rows.size < MAX_SMART_RULES) "Add a rule" else "$MAX_SMART_RULES rules is the most",
                    modifier = Modifier.padding(start = 6.dp),
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Picker(
                    label = "Order",
                    current = draft.sort.label,
                    options = SmartSortOption.entries.map { it.label },
                    onPick = { i -> edit { it.copy(sort = SmartSortOption.entries[i]) } },
                    modifier = Modifier.weight(1f),
                )
                OutlinedTextField(
                    value = draft.limit,
                    onValueChange = { v -> edit { it.copy(limit = v) } },
                    label = { Text("Up to") },
                    suffix = { Text("songs") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.width(150.dp),
                )
            }

            PreviewCard(check, preview, onRetry = { retry++ })

            failure?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }
        }

        Row(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp).navigationBarsPadding(),
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = onDismiss, enabled = !saving) { Text("Cancel") }
            Button(
                enabled = canSave,
                onClick = {
                    val rules = (check as? SmartRulesCheck.Ok)?.rules ?: return@Button
                    saving = true
                    failure = null
                    scope.launch {
                        val problem = onSave(nameCheck?.trimmed.orEmpty(), rules)
                        saving = false
                        if (problem == null) onDismiss() else failure = problem
                    }
                },
            ) { Text(if (saving) "Saving…" else confirmLabel) }
        }
    }
}

/** One rule: pick what it is about, how to compare, and fill the value. */
@Composable
private fun RuleRow(number: Int, row: RuleDraft, canRemove: Boolean, onChange: (RuleDraft) -> Unit, onRemove: () -> Unit) {
    val field = row.field
    val op = field.op(row.op)
    Surface(
        shape = MaterialTheme.cardShape,
        color = MaterialTheme.colorScheme.surfaceContainer,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(start = 12.dp, end = 4.dp, top = 8.dp, bottom = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Picker(
                    label = "Rule $number",
                    current = field.label,
                    options = SmartField.entries.map { it.label },
                    onPick = { i ->
                        val picked = SmartField.entries[i]
                        if (picked != field) onChange(newRuleRow(picked).copy(id = row.id))
                    },
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = onRemove, enabled = canRemove) {
                    Icon(AppIcons.close, contentDescription = "Remove rule $number")
                }
            }
            Row(
                Modifier.padding(end = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (field.kind == ValueKind.YESNO) {
                    Picker(
                        label = "Rule $number answer",
                        current = if (row.value == "no") "No" else "Yes",
                        options = listOf("Yes", "No"),
                        onPick = { i -> onChange(row.copy(value = if (i == 0) "yes" else "no")) },
                    )
                } else {
                    if (field.ops.size > 1) {
                        Picker(
                            label = "Rule $number comparison",
                            current = op.label,
                            options = field.ops.map { it.label },
                            onPick = { i -> onChange(row.copy(op = field.ops[i].key)) },
                        )
                    }
                    if (hasValueBox(field, row.op)) {
                        val text = field.kind == ValueKind.TEXT
                        OutlinedTextField(
                            value = row.value,
                            onValueChange = { onChange(row.copy(value = it)) },
                            label = { Text(valueLabel(field)) },
                            singleLine = true,
                            keyboardOptions = if (text) {
                                KeyboardOptions(capitalization = KeyboardCapitalization.None)
                            } else {
                                KeyboardOptions(keyboardType = if (field.kind == ValueKind.MINUTES) KeyboardType.Decimal else KeyboardType.Number)
                            },
                            modifier = Modifier.weight(1f),
                        )
                    }
                    op.unit?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                }
            }
            op.hint?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(end = 8.dp))
            }
        }
    }
}

private fun valueLabel(field: SmartField): String = when (field.kind) {
    ValueKind.DAYS -> "Days"
    ValueKind.COUNT -> "Times"
    ValueKind.YEAR -> "Year"
    ValueKind.MINUTES -> "Minutes"
    else -> field.label
}

/** A closed box that opens a menu: Material's dropdown field is still experimental, so this is a plain one. */
@Composable
private fun Picker(label: String, current: String, options: List<String>, onPick: (Int) -> Unit, modifier: Modifier = Modifier) {
    var open by remember { mutableStateOf(false) }
    val shape = MaterialTheme.shapes.small
    androidx.compose.foundation.layout.Box(modifier) {
        Row(
            Modifier
                .clip(shape)
                .border(1.dp, MaterialTheme.colorScheme.outline, shape)
                .heightIn(min = 48.dp)
                .clickable(onClickLabel = "Change ${label.lowercase()}", role = Role.DropdownList) { open = true }
                .padding(start = 12.dp, end = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(current, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f, fill = false))
            Icon(AppIcons.arrowDown, contentDescription = null, modifier = Modifier.padding(start = 4.dp))
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEachIndexed { i, option ->
                DropdownMenuItem(text = { Text(option) }, onClick = {
                    open = false
                    onPick(i)
                })
            }
        }
    }
}

@Composable
private fun PreviewCard(check: SmartRulesCheck, state: PreviewState, onRetry: () -> Unit) {
    Surface(
        shape = MaterialTheme.cardShape,
        color = MaterialTheme.colorScheme.surfaceContainerLow,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        modifier = Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite },
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            when {
                check is SmartRulesCheck.Missing ->
                    Text(check.message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                state is PreviewState.Failed -> {
                    Text("Couldn't check the rules.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error)
                    TextButton(onClick = onRetry) { Text("Try again") }
                }
                state is PreviewState.Ready -> {
                    val shown = state.preview
                    Text(
                        if (shown.trackCount == 0) "Nothing matches yet." else "${shown.trackCount} ${if (shown.trackCount == 1) "song" else "songs"} right now",
                        style = MaterialTheme.typography.titleSmall,
                    )
                    shown.tracks.take(PREVIEW_ROWS).forEach { t ->
                        Text(
                            listOfNotNull(t.title, t.artist).joinToString(", "),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    if (shown.trackCount > PREVIEW_ROWS) {
                        Text("and ${shown.trackCount - PREVIEW_ROWS} more", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                else -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (state is PreviewState.Loading) CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                    Text("Checking what these pick…", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}
