---
description: End-of-session wrap-up. Bring STATUS.md, the questions ledger and memory up to date, then print a short handoff.
---

Close out this session. Update the stores that already exist; do not create a new state file.

1. **Git state.** Run `git status --short`, `git log --oneline @{u}..HEAD` (unpushed commits) and
   `git branch --no-merged main`. Do not commit, push or stage anything unless the owner asks in this turn
   (another agent shares the index).
2. **`.docs/STATUS.md`.** If this session moved a feature or the next step, update that row or the *Next* section
   and the `_Last updated:_` line. If nothing moved, leave it alone. Keep it under 150 lines.
3. **Docs owed.** For each commit this session that touches `backend/` or `frontend/`, check that `.docs/CHANGELOG.md`
   and `.docs/FUNCTIONLOG.md` have an entry (`grep -n`, never read them whole). List any that are missing; do not
   write them without asking.
4. **Questions.** Any owner question raised this session that is not yet in `.docs/QUESTIONS.md` gets a `Q<n>`.
   Any answer the owner gave goes to `## Answered` as an `A<n>`.
5. **Memory.** Save or update auto-memory only for non-obvious facts or decisions a future session would otherwise
   miss (see the memory rules). Update an existing file before adding a new one.
6. **Handoff.** Print, in chat only, at most 8 lines: what was done, what is unpushed or uncommitted, the next step,
   and open questions by ID. Name anything you skipped.
