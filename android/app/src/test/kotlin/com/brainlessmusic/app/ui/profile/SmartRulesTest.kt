package com.brainlessmusic.app.ui.profile

import com.brainlessmusic.app.data.remote.dto.SmartRuleDto
import com.brainlessmusic.app.data.remote.dto.SmartRulesDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SmartRulesTest {

    private fun draft(vararg rows: RuleDraft, matchAll: Boolean = true, limit: String = "100") =
        RulesDraft(matchAll, rows.toList(), SmartSortOption.TITLE, limit)

    private fun ok(d: RulesDraft): SmartRulesDto = (checkSmartRules(d) as SmartRulesCheck.Ok).rules

    private fun missing(d: RulesDraft): String = (checkSmartRules(d) as SmartRulesCheck.Missing).message

    @Test
    fun `the starting draft is not played in 60 days and checks out`() {
        val rules = ok(startingRulesDraft())
        assertEquals("all", rules.match)
        assertEquals(1, rules.v)
        assertEquals(listOf(SmartRuleDto("lastPlayed", "olderThanDays", 60)), rules.rules)
    }

    @Test
    fun `liked but rarely played builds two rules in order`() {
        val rules = ok(
            draft(
                newRuleRow(SmartField.LIKED),
                newRuleRow(SmartField.MY_PLAYS, "lt", "3"),
            ),
        )
        assertEquals(
            listOf(SmartRuleDto("liked", "is", true), SmartRuleDto("myPlays", "lt", 3)),
            rules.rules,
        )
    }

    @Test
    fun `never played takes no value and sends none`() {
        val rule = ok(draft(newRuleRow(SmartField.LAST_PLAYED, "never"))).rules.single()
        assertEquals("never", rule.op)
        assertNull(rule.value)
    }

    @Test
    fun `a yes or no field sends true or false`() {
        assertEquals(false, ok(draft(newRuleRow(SmartField.DISLIKED, value = "no"))).rules.single().value)
        assertEquals(true, ok(draft(newRuleRow(SmartField.DISLIKED))).rules.single().value)
    }

    @Test
    fun `length is typed in minutes and sent in seconds`() {
        val rule = ok(draft(newRuleRow(SmartField.LENGTH, "gt", "3.5"))).rules.single()
        assertEquals(210, rule.value)
    }

    @Test
    fun `text is trimmed and a blank one is missing`() {
        assertEquals("Rock", ok(draft(newRuleRow(SmartField.GENRE, "is", "  Rock "))).rules.single().value)
        assertTrue(missing(draft(newRuleRow(SmartField.ARTIST, "contains", "   "))).isNotEmpty())
    }

    @Test
    fun `half-typed numbers are reported, not sent`() {
        assertEquals("Days must be a whole number", missing(draft(newRuleRow(SmartField.LAST_PLAYED, "olderThanDays", ""))))
        assertEquals("Fill in a whole number", missing(draft(newRuleRow(SmartField.MY_PLAYS, "lt", "1.5"))))
        assertEquals("Fill in a whole number", missing(draft(newRuleRow(SmartField.YEAR, "lt", "-1"))))
    }

    @Test
    fun `no rules and a bad limit are reported`() {
        assertEquals("Add at least one rule", missing(draft()))
        val row = newRuleRow(SmartField.MY_PLAYS, "eq", "0")
        assertTrue(missing(draft(row, limit = "0")).startsWith("Limit"))
        assertTrue(missing(draft(row, limit = "501")).startsWith("Limit"))
        assertTrue(missing(draft(row, limit = "")).startsWith("Limit"))
    }

    @Test
    fun `match any is sent as any`() {
        assertEquals("any", ok(draft(newRuleRow(SmartField.LIKED), matchAll = false)).match)
    }

    @Test
    fun `saved rules read back into the same boxes, with Gson's doubles`() {
        val saved = SmartRulesDto(
            match = "any",
            sort = "myPlaysDesc",
            limit = 25,
            rules = listOf(
                SmartRuleDto("lastPlayed", "withinDays", 7.0),
                SmartRuleDto("duration", "lt", 210.0),
                SmartRuleDto("liked", "is", false),
                SmartRuleDto("lastPlayed", "never"),
                SmartRuleDto("genre", "isNot", "Pop"),
            ),
        )
        val back = draftFromRules(saved)
        assertEquals(false, back.matchAll)
        assertEquals(SmartSortOption.MY_PLAYS_DESC, back.sort)
        assertEquals("25", back.limit)
        assertEquals(listOf("7", "3.5", "no", "", "Pop"), back.rows.map { it.value })
        // And back out again unchanged apart from the number types.
        val again = ok(back)
        assertEquals(listOf(7, 210, false, null, "Pop"), again.rules.map { it.value })
    }

    @Test
    fun `a rule from a newer server is left out of the boxes`() {
        val saved = SmartRulesDto(match = "all", sort = "random", limit = 10, rules = listOf(SmartRuleDto("mood", "is", "calm")))
        assertTrue(draftFromRules(saved).rows.isEmpty())
    }

    @Test
    fun `describes the rules in a line`() {
        val saved = SmartRulesDto(
            match = "all",
            sort = "random",
            limit = 100,
            rules = listOf(SmartRuleDto("lastPlayed", "olderThanDays", 60.0), SmartRuleDto("liked", "is", true)),
        )
        assertEquals("I last played it more than 60 days ago, and I liked it", describeRules(saved))
        assertEquals(
            "I played it fewer than 3 times, or I have not disliked it",
            describeRules(
                SmartRulesDto(
                    match = "any",
                    sort = "random",
                    limit = 1,
                    rules = listOf(SmartRuleDto("myPlays", "lt", 3), SmartRuleDto("disliked", "is", false)),
                ),
            ),
        )
        assertEquals("Length shorter than 3.5 minutes", describeRules(SmartRulesDto(match = "all", sort = "random", limit = 1, rules = listOf(SmartRuleDto("duration", "lt", 210)))))
    }
}
