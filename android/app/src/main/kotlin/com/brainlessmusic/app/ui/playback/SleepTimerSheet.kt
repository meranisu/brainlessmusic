package com.brainlessmusic.app.ui.playback

import android.os.SystemClock
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.brainlessmusic.app.playback.SleepTimerState
import com.brainlessmusic.app.ui.common.SkinSheet
import com.brainlessmusic.app.ui.theme.AppIcons
import com.brainlessmusic.app.ui.theme.SheetStatusBarFollowsApp
import kotlinx.coroutines.delay

val SLEEP_TIMER_MINUTES = listOf(15, 30, 45, 60, 90)

/** Minutes left, rounded up, so the last minute reads "1 min" and not "0 min". */
fun sleepMinutesLeft(endsAtMs: Long, nowMs: Long): Int =
    (((endsAtMs - nowMs).coerceAtLeast(0) + 59_999L) / 60_000L).toInt()

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SleepTimerSheet(
    state: SleepTimerState,
    onStart: (minutes: Int) -> Unit,
    onEndOfSong: () -> Unit,
    onCancel: () -> Unit,
    onDismiss: () -> Unit,
) {
    var now by remember { mutableLongStateOf(SystemClock.elapsedRealtime()) }
    LaunchedEffect(state) {
        while (true) {
            now = SystemClock.elapsedRealtime()
            delay(1_000)
        }
    }

    SkinSheet(onDismissRequest = onDismiss) {
        SheetStatusBarFollowsApp()
        Column(Modifier.navigationBarsPadding().padding(bottom = 8.dp)) {
            Text(
                "Sleep timer",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(start = 24.dp, end = 24.dp, bottom = 4.dp),
            )
            Text(
                when (state) {
                    SleepTimerState.Off -> "Fades out and pauses. Your queue stays for tomorrow."
                    SleepTimerState.EndOfSong -> "Pauses when this song ends."
                    is SleepTimerState.Countdown -> "Fades out in ${sleepMinutesLeft(state.endsAtMs, now)} min."
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 24.dp, end = 24.dp, bottom = 12.dp),
            )
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            SLEEP_TIMER_MINUTES.forEach { minutes ->
                SleepRow(label = "$minutes minutes") { onStart(minutes); onDismiss() }
            }
            SleepRow(label = "End of current song") { onEndOfSong(); onDismiss() }
            if (state != SleepTimerState.Off) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                SleepRow(label = "Turn off timer", tint = MaterialTheme.colorScheme.error) { onCancel(); onDismiss() }
            }
        }
    }
}

@Composable
private fun SleepRow(label: String, tint: Color? = null, onClick: () -> Unit) {
    ListItem(
        leadingContent = { Icon(AppIcons.sleep, contentDescription = null, tint = tint ?: MaterialTheme.colorScheme.onSurfaceVariant) },
        headlineContent = { Text(label, color = tint ?: Color.Unspecified) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.clickable(onClick = onClick).padding(horizontal = 8.dp),
    )
}
