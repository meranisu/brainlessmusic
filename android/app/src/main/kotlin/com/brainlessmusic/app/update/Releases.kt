package com.brainlessmusic.app.update

/**
 * GitHub Releases as the updater sees them (`api.github.com/repos/.../releases`). Field names match GitHub's JSON for
 * Gson. Pure functions below, for tests. Plan: `.docs/features/app-self-update/planning.md`.
 */
data class GithubAsset(
    val name: String,
    val size: Long,
    val browser_download_url: String,
    /** `sha256:<hex>`; GitHub fills it for every asset. */
    val digest: String?,
)

data class GithubRelease(
    val tag_name: String,
    val body: String?,
    val draft: Boolean,
    val prerelease: Boolean,
    val assets: List<GithubAsset>,
)

data class ReleaseNotes(val version: String, val notes: String)

/** The newest release with an APK, and the notes of every release newer than the installed one, newest first (A106). */
data class UpdateOffer(
    val version: String,
    val apkUrl: String,
    val apkBytes: Long,
    /** Lower-case hex, or null if GitHub sent none (then the download isn't checked). */
    val sha256: String?,
    val notes: List<ReleaseNotes>,
)

/** `v0.3.10` or `0.3.10` (a `-debug` suffix is ignored) → `[0, 3, 10]`; null for anything else. */
fun parseVersion(raw: String): List<Int>? {
    val match = Regex("""^v?(\d+)\.(\d+)\.(\d+)(?:-.*)?$""").matchEntire(raw.trim()) ?: return null
    return match.groupValues.drop(1).map { it.toInt() }
}

/** Compares numerically, so `0.3.9` < `0.3.10`. Unparseable versions sort lowest. */
fun compareVersions(a: String, b: String): Int {
    val x = parseVersion(a) ?: return if (parseVersion(b) == null) 0 else -1
    val y = parseVersion(b) ?: return 1
    for (i in 0..2) if (x[i] != y[i]) return x[i].compareTo(y[i])
    return 0
}

/** What the workflow appends to every release ("## Installing", how to sideload): not news to someone updating in-app. */
fun notesWithoutInstalling(body: String?): String =
    body.orEmpty().substringBefore("\n## Installing").trim()

/**
 * The offer for [installed], or null when nothing newer has an APK. Drafts, pre-releases and tags that aren't
 * `vX.Y.Z` are ignored.
 */
fun pickOffer(releases: List<GithubRelease>, installed: String): UpdateOffer? {
    val newer = releases
        .filter { !it.draft && !it.prerelease && parseVersion(it.tag_name) != null }
        .filter { compareVersions(it.tag_name, installed) > 0 }
        .sortedWith { a, b -> compareVersions(b.tag_name, a.tag_name) }
    val latest = newer.firstOrNull { release -> release.assets.any { it.name.endsWith(".apk") } } ?: return null
    val apk = latest.assets.first { it.name.endsWith(".apk") }
    return UpdateOffer(
        version = latest.tag_name.removePrefix("v"),
        apkUrl = apk.browser_download_url,
        apkBytes = apk.size,
        sha256 = apk.digest?.takeIf { it.startsWith("sha256:") }?.removePrefix("sha256:")?.lowercase(),
        notes = newer
            .filter { compareVersions(it.tag_name, latest.tag_name) <= 0 }
            .map { ReleaseNotes(it.tag_name.removePrefix("v"), notesWithoutInstalling(it.body)) },
    )
}
