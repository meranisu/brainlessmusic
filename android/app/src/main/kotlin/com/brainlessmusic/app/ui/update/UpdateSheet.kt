package com.brainlessmusic.app.ui.update

import com.brainlessmusic.app.ui.common.Notices
import android.content.ActivityNotFoundException
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.brainlessmusic.app.ui.common.SkinSheet
import com.brainlessmusic.app.BuildConfig
import com.brainlessmusic.app.update.ReleaseNotes
import com.brainlessmusic.app.update.UpdateOffer
import com.brainlessmusic.app.update.UpdateState
import com.brainlessmusic.app.ui.theme.accentInk

/**
 * The update sheet (A104–A106), shown over whatever screen is open when a check finds a newer release: the notes of
 * every release since this one, then Install now or Later. Lives once, at the top of the app.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UpdateSheetHost(viewModel: UpdateViewModel = hiltViewModel()) {
    val open by viewModel.sheetOpen.collectAsStateWithLifecycle()
    val state by viewModel.state.collectAsStateWithLifecycle()
    val offer = when (val s = state) {
        is UpdateState.Available -> s.offer
        is UpdateState.Downloading -> s.offer
        is UpdateState.Ready -> s.offer
        is UpdateState.Failed -> s.offer
        else -> null
    }
    if (!open || offer == null) return

    SkinSheet(onDismissRequest = viewModel::later) {
        UpdateSheetContent(offer, state, viewModel)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun UpdateSheetContent(offer: UpdateOffer, state: UpdateState, viewModel: UpdateViewModel) {
    val context = LocalContext.current
    Column(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
            .navigationBarsPadding()
            .padding(bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Update to v${offer.version}", style = MaterialTheme.typography.titleLarge)
        Text(
            "You're on v${BuildConfig.VERSION_NAME}. ${"%.1f".format(offer.apkBytes / 1024.0 / 1024.0)} MB from GitHub.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        // Every release since this one, newest first; scrolls on its own so the buttons stay in reach.
        Column(
            Modifier
                .heightIn(max = 360.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            offer.notes.forEachIndexed { index, release ->
                if (index > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                ReleaseNotesBlock(release)
            }
        }

        if (viewModel.isPlaying && state !is UpdateState.Downloading) {
            Text(
                "Installing closes the app, so the music stops. Your queue is saved and comes back after.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.accentInk,
            )
        }

        when (state) {
            is UpdateState.Downloading -> {
                Text(
                    state.progress?.let { "Downloading… ${(it * 100).toInt()}%" } ?: "Downloading…",
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
                state.progress?.let { LinearProgressIndicator(progress = { it }, modifier = Modifier.fillMaxWidth()) }
                    ?: LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }
            is UpdateState.Failed -> Text(
                state.message,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            )
            is UpdateState.Ready -> if (!viewModel.canInstall()) {
                Text(
                    "Android asks once to allow installs from brainlessmusic. Turn it on, come back, and tap Install again.",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            else -> Unit
        }

        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            when (state) {
                is UpdateState.Ready -> Button(onClick = {
                    try {
                        context.startActivity(viewModel.installIntent(state.file))
                    } catch (e: ActivityNotFoundException) {
                        Notices.show("This phone has no installer to open the update with.", long = true)
                    }
                }) { Text("Install") }
                is UpdateState.Downloading -> Button(onClick = {}, enabled = false) { Text("Install now") }
                is UpdateState.Failed -> Button(onClick = viewModel::download) { Text("Try again") }
                else -> Button(onClick = viewModel::download) { Text("Install now") }
            }
            OutlinedButton(onClick = viewModel::later) { Text("Later") }
        }
    }
}

@Composable
private fun ReleaseNotesBlock(release: ReleaseNotes) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("v${release.version}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        if (release.notes.isBlank()) {
            Text("No notes for this one.", style = MaterialTheme.typography.bodyMedium)
        }
        // The release notes' markdown: `##` headings, `- ` bullets with indented continuation lines, paragraphs.
        val lines = mutableListOf<Pair<String, String>>()
        for (raw in release.notes.lines()) {
            val line = raw.trimEnd()
            when {
                line.startsWith("## ") -> lines += "h" to line.removePrefix("## ")
                line.startsWith("- ") -> lines += "li" to line.removePrefix("- ")
                line.isBlank() -> lines += "gap" to ""
                raw.startsWith(" ") && lines.lastOrNull()?.first == "li" ->
                    lines[lines.lastIndex] = "li" to lines.last().second + " " + line.trim()
                lines.lastOrNull()?.first == "p" -> lines[lines.lastIndex] = "p" to lines.last().second + " " + line.trim()
                else -> lines += "p" to line
            }
        }
        lines.filter { it.first != "gap" }.forEach { (kind, text) ->
            when (kind) {
                "h" -> Text(
                    text.replaceFirstChar { it.uppercase() },
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp),
                )
                "li" -> Text(
                    buildAnnotatedString { append("•  "); append(inline(text)) },
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(start = 4.dp),
                )
                else -> Text(inline(text), style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

/** `**bold**` and `` `code` ``, the only inline markup the notes use. */
private fun inline(text: String): AnnotatedString = buildAnnotatedString {
    Regex("""\*\*[^*]+\*\*|`[^`]+`""").let { pattern ->
        var at = 0
        for (match in pattern.findAll(text)) {
            append(text.substring(at, match.range.first))
            val token = match.value
            if (token.startsWith("**")) {
                withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(token.removeSurrounding("**")) }
            } else {
                withStyle(SpanStyle(fontFamily = FontFamily.Monospace)) { append(token.removeSurrounding("`")) }
            }
            at = match.range.last + 1
        }
        append(text.substring(at))
    }
}
