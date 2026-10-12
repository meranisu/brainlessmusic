package com.brainlessmusic.app.ui.settings

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.brainlessmusic.app.ui.update.ReleaseNotesBlock
import com.brainlessmusic.app.update.ReleaseNotes
import com.brainlessmusic.app.update.loadReleaseHistory
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Settings → What's new (A155): every release's notes, newest first, read from the APK. */
@Composable
internal fun WhatsNewContent() {
    val assets = LocalContext.current.assets
    val releases by produceState<List<ReleaseNotes>?>(null) {
        value = withContext(Dispatchers.IO) { loadReleaseHistory(assets) }
    }
    val list = releases
    when {
        list == null -> Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        list.isEmpty() -> Text(
            "No release notes in this build.",
            style = MaterialTheme.typography.bodyMedium,
            modifier = Modifier.padding(16.dp),
        )
        else -> list.forEachIndexed { i, release ->
            if (i > 0) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Box(Modifier.fillMaxWidth().padding(16.dp)) { ReleaseNotesBlock(release) }
        }
    }
}
