package com.brainlessmusic.app.ui.settings

import androidx.annotation.RawRes
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import com.brainlessmusic.app.R
import com.brainlessmusic.app.ui.theme.AppIcons
import com.brainlessmusic.app.ui.theme.accentInk
import com.brainlessmusic.app.ui.theme.tileShape

private const val APACHE = "Apache License 2.0"
private const val APACHE_URL = "https://www.apache.org/licenses/LICENSE-2.0"
private const val OFL = "SIL Open Font License 1.1"

/** One thing the app is made of, and the license it comes under. [text] is the full license, shown on tap. */
private data class Credit(
    val name: String,
    val detail: String,
    val license: String,
    val link: String? = null,
    @RawRes val text: Int? = null,
)

private val App = listOf(
    Credit(
        "brainlessmusic",
        "The app, its server and web player. Source: https://github.com/meranisu/brainlessmusic",
        APACHE,
        text = R.raw.license_apache_2_0,
    ),
)

private val Fonts = listOf(
    Credit("Fredoka", "Copyright 2016 The Fredoka Project Authors. The wordmark, and Hit circle's headings", OFL, text = R.raw.license_ofl_1_1),
    Credit("Barlow Condensed", "Copyright 2017 The Barlow Project Authors. Song titles at display size", OFL, text = R.raw.license_ofl_1_1),
    Credit("Exo 2", "Copyright 2013 The Exo 2 Project Authors. The Lane skin's type", OFL, text = R.raw.license_ofl_1_1),
)

private val Icons = listOf(
    Credit(
        "Font Awesome Free 6.5.2",
        "Copyright 2024 Fonticons, Inc. The Hit circle skin's icons",
        "Creative Commons Attribution 4.0 (CC BY 4.0)",
        link = "https://creativecommons.org/licenses/by/4.0/",
    ),
    Credit(
        "Lucide 0.460.0",
        "Copyright Lucide Contributors 2022, portions Cole Bemis 2013-2022 (Feather). The Lane skin's icons",
        "ISC License",
        text = R.raw.license_lucide_isc,
    ),
    Credit("Material Icons", "Google. The Standard skin's icons", APACHE, link = APACHE_URL),
)

// The versions in android/gradle/libs.versions.toml; every one is Apache 2.0.
private val Libraries = listOf(
    "Jetpack Compose (BOM 2024.09.00), Material 3 and Material Icons" to "Google / The Android Open Source Project",
    "AndroidX Core 1.13.1, Splashscreen 1.0.1, Activity 1.9.1, Lifecycle 2.8.4, Navigation 2.7.7" to "Google / The Android Open Source Project",
    "AndroidX Media3 1.4.1 (ExoPlayer, Session, OkHttp data source)" to "Google / The Android Open Source Project",
    "AndroidX Room 2.6.1, DataStore 1.1.1, Paging 3.3.2" to "Google / The Android Open Source Project",
    "Dagger Hilt 2.51.1, Hilt Navigation Compose 1.2.0" to "Google",
    "Kotlin 1.9.24 and kotlinx.coroutines 1.8.1" to "JetBrains",
    "Retrofit 2.11.0 and OkHttp 4.12.0" to "Square, Inc.",
    "Gson 2.11.0" to "Google",
    "Coil 2.7.0" to "Coil Contributors",
    "Reorderable 2.4.3" to "Calvin Liang",
)

/** Settings → Licenses: the app's own license, then the fonts, icons and libraries it ships, each with its license. */
@Composable
internal fun LicensesContent() {
    Section("This app", App)
    Rule()
    Section("Fonts", Fonts)
    Rule()
    Section("Icons", Icons)
    Rule()
    Section(
        "Libraries",
        Libraries.map { (name, holder) -> Credit(name, holder, APACHE, text = R.raw.license_apache_2_0) },
    )
}

@Composable
private fun Section(title: String, credits: List<Credit>) {
    Column(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
        Text(
            title,
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.accentInk,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
        )
        credits.forEach { CreditRow(it) }
    }
}

@Composable
private fun CreditRow(credit: Credit) {
    var open by rememberSaveable(credit.name) { mutableStateOf(false) }
    val canOpen = credit.text != null
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (canOpen) Modifier.clickable(role = Role.Button, onClickLabel = if (open) "Hide license" else "Show license") { open = !open } else Modifier)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(credit.name, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
            if (canOpen) {
                Icon(
                    if (open) AppIcons.arrowDown else AppIcons.arrowRight,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Text(credit.detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(credit.license, style = MaterialTheme.typography.labelMedium)
        credit.link?.let { link ->
            val uri = LocalUriHandler.current
            Text(
                link,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.accentInk,
                modifier = Modifier.clickable(role = Role.Button, onClickLabel = "Open in browser") { uri.openUri(link) },
            )
        }
        if (open && credit.text != null) LicenseText(credit.text)
    }
}

@Composable
private fun LicenseText(@RawRes res: Int) {
    val context = LocalContext.current
    val text = remember(res) { context.resources.openRawResource(res).bufferedReader().use { it.readText() } }
    Surface(
        shape = tileShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
    ) {
        SelectionContainer {
            Text(
                text.trim(),
                style = MaterialTheme.typography.bodySmall,
                fontFamily = FontFamily.Monospace,
                modifier = Modifier.padding(12.dp),
            )
        }
    }
}

@Composable
private fun Rule() {
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
}
