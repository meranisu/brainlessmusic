package com.brainlessmusic.app.ui.profile

import com.brainlessmusic.app.data.remote.dto.SmartRuleDto
import com.brainlessmusic.app.data.remote.dto.SmartRulesDto
import kotlin.math.roundToInt

/**
 * Smart playlist rules (A207) as the editor holds them. Every box is text until it is checked, so a half-typed number
 * never reaches the server, which checks the same rules again against its own fixed list. Mirrors the web editor's
 * `lib/smartRules.ts`; keep the two in step.
 */

/** What a rule's value box holds. */
enum class ValueKind { DAYS, COUNT, YEAR, MINUTES, TEXT, YESNO }

/** One comparison a field offers. [unit] is said after the value box, [hint] under the rule. */
data class SmartOp(val key: String, val label: String, val unit: String? = null, val hint: String? = null)

enum class SmartField(
    val key: String,
    val label: String,
    val kind: ValueKind,
    val ops: List<SmartOp>,
    /** For a yes/no field, how the rule reads in a sentence when the answer is yes and when it is no. */
    val yes: String? = null,
    val no: String? = null,
) {
    LAST_PLAYED(
        "lastPlayed", "I last played it", ValueKind.DAYS,
        listOf(
            SmartOp("olderThanDays", "more than", "days ago", "Songs you have never played count too."),
            SmartOp("withinDays", "within the last", "days"),
            SmartOp("never", "never"),
        ),
    ),
    MY_PLAYS(
        "myPlays", "I played it", ValueKind.COUNT,
        listOf(SmartOp("lt", "fewer than", "times"), SmartOp("gt", "more than", "times"), SmartOp("eq", "exactly", "times")),
    ),
    LIKED("liked", "I liked it", ValueKind.YESNO, listOf(SmartOp("is", "is")), "I liked it", "I have not liked it"),
    DISLIKED("disliked", "I disliked it", ValueKind.YESNO, listOf(SmartOp("is", "is")), "I disliked it", "I have not disliked it"),
    DATE_ADDED(
        "dateAdded", "Added to the library", ValueKind.DAYS,
        listOf(SmartOp("olderThanDays", "more than", "days ago"), SmartOp("withinDays", "within the last", "days")),
    ),
    GENRE("genre", "Genre", ValueKind.TEXT, listOf(SmartOp("is", "is"), SmartOp("isNot", "is not"))),
    ARTIST("artist", "Artist", ValueKind.TEXT, listOf(SmartOp("is", "is"), SmartOp("contains", "contains"))),
    YEAR("year", "Album year", ValueKind.YEAR, listOf(SmartOp("lt", "before"), SmartOp("gt", "after"), SmartOp("eq", "is"))),
    LENGTH(
        "duration", "Length", ValueKind.MINUTES,
        listOf(SmartOp("lt", "shorter than", "minutes"), SmartOp("gt", "longer than", "minutes")),
    );

    fun op(key: String): SmartOp = ops.firstOrNull { it.key == key } ?: ops.first()

    companion object {
        fun of(key: String): SmartField? = entries.firstOrNull { it.key == key }
    }
}

enum class SmartSortOption(val key: String, val label: String) {
    RANDOM("random", "Random, new mix each day"),
    LAST_PLAYED_ASC("lastPlayedAsc", "Longest since I played it"),
    MY_PLAYS_DESC("myPlaysDesc", "Most played by me"),
    MY_PLAYS_ASC("myPlaysAsc", "Least played by me"),
    DATE_ADDED_DESC("dateAddedDesc", "Newest in the library"),
    TITLE("title", "Title");

    companion object {
        fun of(key: String): SmartSortOption = entries.firstOrNull { it.key == key } ?: RANDOM
    }
}

const val MAX_SMART_RULES = 10
const val MAX_SMART_LIMIT = 500
const val DEFAULT_SMART_LIMIT = 100

data class RuleDraft(val id: Int, val field: SmartField, val op: String, val value: String)

data class RulesDraft(
    val matchAll: Boolean,
    val rows: List<RuleDraft>,
    val sort: SmartSortOption,
    val limit: String,
)

sealed interface SmartRulesCheck {
    data class Ok(val rules: SmartRulesDto) : SmartRulesCheck

    /** What is still missing, in words fit to show. */
    data class Missing(val message: String) : SmartRulesCheck
}

private var nextRowId = 1

/** A fresh row for [field]: its first op, an empty box (a yes/no starts on yes). */
fun newRuleRow(field: SmartField, op: String = field.ops.first().key, value: String = ""): RuleDraft =
    RuleDraft(nextRowId++, field, op, if (field.kind == ValueKind.YESNO && value.isEmpty()) "yes" else value)

/** What a new smart playlist starts as: the first example, so the preview shows something straight away. */
fun startingRulesDraft() = RulesDraft(
    matchAll = true,
    rows = listOf(newRuleRow(SmartField.LAST_PLAYED, "olderThanDays", "60")),
    sort = SmartSortOption.RANDOM,
    limit = DEFAULT_SMART_LIMIT.toString(),
)

/** Whether the rule has a box to fill: "never played" and the yes/no fields have none. */
fun hasValueBox(field: SmartField, op: String): Boolean =
    field.kind != ValueKind.YESNO && !(field == SmartField.LAST_PLAYED && op == "never")

private fun wholeNumber(text: String, max: Int): Int? =
    text.trim().toIntOrNull()?.takeIf { it in 0..max }

private fun ruleOf(row: RuleDraft): Pair<SmartRuleDto?, String?> {
    val field = row.field
    val key = field.key
    return when (field.kind) {
        ValueKind.DAYS -> {
            if (field == SmartField.LAST_PLAYED && row.op == "never") return SmartRuleDto(key, "never") to null
            val n = wholeNumber(row.value, 36500) ?: return null to "Days must be a whole number"
            SmartRuleDto(key, row.op, n) to null
        }
        ValueKind.COUNT -> {
            val n = wholeNumber(row.value, 100000) ?: return null to "Fill in a whole number"
            SmartRuleDto(key, row.op, n) to null
        }
        ValueKind.YEAR -> {
            val n = wholeNumber(row.value, 3000) ?: return null to "Fill in a whole number"
            SmartRuleDto(key, row.op, n) to null
        }
        ValueKind.YESNO -> SmartRuleDto(key, "is", row.value != "no") to null
        ValueKind.TEXT -> {
            val text = row.value.trim()
            when {
                text.isEmpty() -> null to "Fill in the ${key}"
                text.length > 100 -> null to "Keep it under 100 characters"
                else -> SmartRuleDto(key, row.op, text) to null
            }
        }
        ValueKind.MINUTES -> {
            val minutes = row.value.trim().toDoubleOrNull()
            if (minutes == null || minutes < 0 || minutes > 1440) return null to "Length is minutes, up to 1440"
            SmartRuleDto(key, row.op, (minutes * 60).roundToInt()) to null
        }
    }
}

/** The draft as the server wants it, or what is still missing. */
fun checkSmartRules(draft: RulesDraft): SmartRulesCheck {
    if (draft.rows.isEmpty()) return SmartRulesCheck.Missing("Add at least one rule")
    val rules = mutableListOf<SmartRuleDto>()
    for (row in draft.rows) {
        val (rule, problem) = ruleOf(row)
        if (rule == null) return SmartRulesCheck.Missing(problem ?: "Fill in every rule")
        rules += rule
    }
    val limit = wholeNumber(draft.limit, MAX_SMART_LIMIT)?.takeIf { it >= 1 }
        ?: return SmartRulesCheck.Missing("Limit is a whole number from 1 to $MAX_SMART_LIMIT")
    return SmartRulesCheck.Ok(
        SmartRulesDto(match = if (draft.matchAll) "all" else "any", rules = rules, sort = draft.sort.key, limit = limit),
    )
}

/** Gson reads every number back as a Double; 60.0 is shown as 60. */
private fun numberText(value: Any?): String {
    val d = (value as? Number)?.toDouble() ?: return value?.toString().orEmpty()
    return if (d == d.toLong().toDouble()) d.toLong().toString() else d.toString()
}

/** Saved rules back into boxes, for editing. A rule this app doesn't know (a newer server) is left out. */
fun draftFromRules(saved: SmartRulesDto): RulesDraft = RulesDraft(
    matchAll = saved.match != "any",
    sort = SmartSortOption.of(saved.sort),
    limit = saved.limit.toString(),
    rows = saved.rules.mapNotNull { rule ->
        val field = SmartField.of(rule.field) ?: return@mapNotNull null
        when (field.kind) {
            ValueKind.YESNO -> newRuleRow(field, value = if (rule.value == false) "no" else "yes")
            ValueKind.MINUTES -> newRuleRow(field, rule.op, numberText((rule.value as? Number)?.toDouble()?.div(60)))
            else -> newRuleRow(field, rule.op, if (rule.value == null) "" else numberText(rule.value))
        }
    },
)

private fun ruleText(rule: SmartRuleDto): String? {
    val field = SmartField.of(rule.field) ?: return null
    if (field.kind == ValueKind.YESNO) return (if (rule.value == false) field.no else field.yes) ?: field.label
    val op = field.op(rule.op)
    val value = when {
        rule.value == null -> null
        field.kind == ValueKind.MINUTES -> numberText((rule.value as? Number)?.toDouble()?.div(60))
        else -> numberText(rule.value)
    }
    return listOfNotNull(field.label, op.label, value, op.unit).joinToString(" ")
}

/** The rules in one line for the playlist page: "I last played it more than 60 days ago, and I liked it". */
fun describeRules(saved: SmartRulesDto): String =
    saved.rules.mapNotNull(::ruleText).joinToString(if (saved.match == "any") ", or " else ", and ")
