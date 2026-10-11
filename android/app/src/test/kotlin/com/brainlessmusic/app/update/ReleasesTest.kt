package com.brainlessmusic.app.update

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ReleasesTest {
    private fun release(tag: String, apk: Boolean = true, draft: Boolean = false, prerelease: Boolean = false, body: String = "notes for $tag") =
        GithubRelease(
            tag_name = tag,
            body = body,
            draft = draft,
            prerelease = prerelease,
            assets = if (apk) listOf(GithubAsset("brainlessmusic-$tag.apk", 3_000_000, "https://example/$tag.apk", "sha256:ABC123")) else emptyList(),
        )

    @Test
    fun `versions compare as numbers`() {
        assertTrue(compareVersions("v0.3.10", "0.3.9") > 0)
        assertTrue(compareVersions("0.3.28", "v0.4.0") < 0)
        assertEquals(0, compareVersions("v0.3.28", "0.3.28-debug"))
        assertNull(parseVersion("nightly"))
    }

    @Test
    fun `nothing newer means no offer`() {
        assertNull(pickOffer(listOf(release("v0.3.28"), release("v0.3.27")), "0.3.28"))
    }

    @Test
    fun `the newest release is offered with every newer release's notes, newest first`() {
        val offer = pickOffer(listOf(release("v0.3.27"), release("v0.3.30"), release("v0.3.29"), release("v0.3.28")), "0.3.28")!!
        assertEquals("0.3.30", offer.version)
        assertEquals(listOf("0.3.30", "0.3.29"), offer.notes.map { it.version })
        assertEquals("abc123", offer.sha256)
    }

    @Test
    fun `drafts, pre-releases and odd tags are ignored`() {
        val offer = pickOffer(
            listOf(release("v0.4.0", draft = true), release("v0.3.31", prerelease = true), release("nightly"), release("v0.3.29")),
            "0.3.28",
        )!!
        assertEquals("0.3.29", offer.version)
        assertEquals(listOf("0.3.29"), offer.notes.map { it.version })
    }

    @Test
    fun `a newest release without an APK falls back to the one before it`() {
        val offer = pickOffer(listOf(release("v0.3.30", apk = false), release("v0.3.29")), "0.3.28")!!
        assertEquals("0.3.29", offer.version)
        assertEquals(listOf("0.3.29"), offer.notes.map { it.version })
    }

    @Test
    fun `the appended install instructions are dropped from the notes`() {
        val body = "## what changed\n\n- a thing\n\n## Installing\n\nDownload `x.apk` below."
        assertEquals("## what changed\n\n- a thing", notesWithoutInstalling(body))
        assertEquals("", notesWithoutInstalling(null))
    }
}
