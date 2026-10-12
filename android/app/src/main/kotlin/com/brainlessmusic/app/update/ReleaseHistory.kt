package com.brainlessmusic.app.update

import android.content.res.AssetManager

/**
 * Every release's notes for Settings → What's new (A155), newest first. The build copies every `android/release-notes/vX.Y.Z.md`
 * into `assets/release-notes/`, so this needs no network and works in debug builds too.
 */
fun loadReleaseHistory(assets: AssetManager): List<ReleaseNotes> =
    assets.list("release-notes").orEmpty()
        .filter { Regex("""^v\d+\.\d+\.\d+\.md$""").matches(it) }
        .map { file ->
            val text = assets.open("release-notes/$file").bufferedReader().use { it.readText() }
            ReleaseNotes(file.removePrefix("v").removeSuffix(".md"), notesForHistory(text))
        }
        .sortedWith { a, b -> compareVersions(b.version, a.version) }

/** Drops the "## upgrading" section (how to get the release): not news to someone already running it. */
fun notesForHistory(markdown: String): String {
    var skipping = false
    return markdown.lines().filter { line ->
        if (line.startsWith("## ")) skipping = line.removePrefix("## ").trim().startsWith("upgrading", ignoreCase = true)
        !skipping
    }.joinToString("\n").trim()
}
