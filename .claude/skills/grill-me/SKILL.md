---
name: grill-me
description: Stress-test a feature plan before any code by interviewing the owner in rounds of numbered questions, each with a recommended answer. Use only when the owner types /grill-me or asks to be grilled.
disable-model-invocation: true
---

<!-- Adapted from mattpocock/skills `grilling` (MIT), commit 49dd158. Changes: wired to QUESTIONS.md and the
     phase-plan template; facts looked up directly before reaching for a sub-agent (Pro token budget). -->

Interview the owner until you reach a shared understanding of the plan. Map it as a **design tree**: every decision
branches into the decisions that hang off it.

**Before the first round**, read `.docs/QUESTIONS.md`'s `## Answered` section (grep for the feature's topic; never read
the file whole). Anything decided there is settled: do not ask it again, treat it as a prerequisite already met.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are settled: the questions you can
ask _now_ without guessing at answers you haven't heard. Ask the whole frontier in one round, numbered, each with your
recommended answer, then wait.

```
❓ **Q1** - **<question title>**: <question body, with the choices if there are any>

➡️ <your recommended answer>

---

❓ **Q2** - ...
```

Word each question so "yes" accepts your recommendation. The owner prefers quick picks: keep each question short and
plain.

Each round reshapes the tree: settled decisions push the frontier out. Recompute it and ask the next round. A question
that depends on another one still open this round belongs to a later round.

**Facts are your job, decisions are the owner's.** Never ask for something you can look up. Find facts with a direct
`grep`/`Read` first; dispatch a sub-agent only when it would take more than three searches. Questions downstream of a
pending lookup wait; ask the rest now.

**Record as you go.** After each round, add every answer to `.docs/QUESTIONS.md` `## Answered` as the next free
`A<n>` (decision, date, "grill-me, <feature>"). A question the owner defers gets a `Q<n>` with the assumption you'll
build on. IDs are permanent; check the highest existing one before numbering.

**Done** when the frontier is empty: every branch visited, nothing silently assumed. Confirm with the owner, then write
or update `.docs/features/<feature-name>/planning.md` from `.docs/phase-plan-example.md`: Goal, **Done when**, **Not
doing**, **Decisions** (the `A<n>`/`Q<n>` IDs only), and the Phase 1 checklist. Do not start building until the owner
says go.
