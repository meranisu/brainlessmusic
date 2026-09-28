package com.brainlessmusic.app.playback

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ResumeSavePolicyTest {

    private val playing = ResumeSnapshot(listOf(1, 2, 3), index = 0, playing = true)

    @Test
    fun firstNonEmptySnapshotIsSaved() {
        assertTrue(ResumeSavePolicy().shouldSave(playing, nowMs = 0))
    }

    @Test
    fun anEmptyQueueIsNeverSaved() {
        val policy = ResumeSavePolicy()
        assertFalse(policy.shouldSave(ResumeSnapshot(emptyList(), -1, false), nowMs = 0))
        assertFalse(policy.shouldSave(ResumeSnapshot(emptyList(), -1, false), nowMs = 60_000))
    }

    @Test
    fun aQueueTheServerWouldRejectIsNeverSaved() {
        val huge = ResumeSnapshot(List(MAX_SAVED_QUEUE + 1) { it + 1 }, 0, true)
        assertFalse(ResumeSavePolicy().shouldSave(huge, nowMs = 0))
    }

    @Test
    fun anUnchangedSnapshotWaitsForTheInterval() {
        val policy = ResumeSavePolicy(intervalMs = 10_000)
        assertTrue(policy.shouldSave(playing, nowMs = 0))
        assertFalse(policy.shouldSave(playing, nowMs = 9_999))
        assertTrue(policy.shouldSave(playing, nowMs = 10_000))
    }

    @Test
    fun aPausedPlayerIsOnlySavedWhenItChanges() {
        val policy = ResumeSavePolicy(intervalMs = 10_000)
        val paused = playing.copy(playing = false)
        assertTrue(policy.shouldSave(paused, nowMs = 0))
        assertFalse(policy.shouldSave(paused, nowMs = 60_000))
    }

    @Test
    fun pausingAndTrackChangesAreSavedImmediately() {
        val policy = ResumeSavePolicy(intervalMs = 10_000)
        assertTrue(policy.shouldSave(playing, nowMs = 0))
        assertTrue(policy.shouldSave(playing.copy(playing = false), nowMs = 1))
        assertTrue(policy.shouldSave(playing.copy(playing = false, index = 1), nowMs = 2))
    }

    @Test
    fun aReorderedQueueIsSaved() {
        val policy = ResumeSavePolicy(intervalMs = 10_000)
        assertTrue(policy.shouldSave(playing, nowMs = 0))
        assertTrue(policy.shouldSave(playing.copy(trackIds = listOf(1, 9, 2, 3)), nowMs = 1))
    }
}
