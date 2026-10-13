package com.brainlessmusic.app.invites

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Typed invite codes (A191): loose on case, spaces and dashes; strict on length and the alphabet. */
class InviteCodeTest {
    @Test
    fun `a typed code is cleaned up`() {
        assertEquals("ABCD2345", InviteLinks.normalize("abcd-2345"))
        assertEquals("ABCD2345", InviteLinks.normalize(" ABCD 2345 "))
    }

    @Test
    fun `a code of the wrong length or with look-alike characters is refused`() {
        assertNull(InviteLinks.normalize("ABCD234"))
        assertNull(InviteLinks.normalize("ABCD23456"))
        // 0, O, 1, I and L are left out of the alphabet.
        assertNull(InviteLinks.normalize("ABCD2340"))
        assertNull(InviteLinks.normalize("ABCD234O"))
        assertNull(InviteLinks.normalize("ABCD2341"))
        assertNull(InviteLinks.normalize("ABCD234L"))
    }
}
