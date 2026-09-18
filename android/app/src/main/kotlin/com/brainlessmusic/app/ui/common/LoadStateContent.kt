package com.brainlessmusic.app.ui.common

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** The loading/error/empty boilerplate every browsing screen needs, once. */
@Composable
fun <T> LoadStateContent(
    state: LoadState<T>,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
    isEmpty: (T) -> Boolean = { false },
    emptyMessage: String = "Nothing here yet.",
    content: @Composable (T) -> Unit,
) {
    when (state) {
        is LoadState.Loading -> Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }

        is LoadState.Error -> Column(
            modifier = modifier
                .fillMaxSize()
                .padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(state.message, style = MaterialTheme.typography.bodyMedium)
            OutlinedButton(onClick = onRetry, modifier = Modifier.padding(top = 16.dp)) {
                Text("Retry")
            }
        }

        is LoadState.Content -> if (isEmpty(state.data)) {
            Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(emptyMessage, style = MaterialTheme.typography.bodyMedium)
            }
        } else {
            content(state.data)
        }
    }
}
