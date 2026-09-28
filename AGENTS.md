# Antigravity Workspace Rules — brainlessmusic

Before taking action or modifying code in this workspace, adhere to the following rules:

1. **Co-working with Claude Code:**
   - You and Claude Code are pair-developing this project collaboratively.
   - Always run `git status` or inspect recent changes before writing code to avoid overwriting or conflicting with Claude Code's ongoing or uncommitted work (e.g., in `backend/` or `android/`).
   - Respect established conventions and implementations in the root [CLAUDE.md](CLAUDE.md) (hard rules), [.docs/CLAUDE.md](.docs/CLAUDE.md) and [.docs/ANTIGRAVITY.md](.docs/ANTIGRAVITY.md).
   - The hard rules bind you too, even though the enforcing hooks are Claude-only: run backend tests only with `cd backend && npm test` (a direct run once destroyed the owner's library), never read `.env` files, and never add AI attribution to commits.

2. **Cross-reference Documentation First:**
   - The `.docs/` directory is the single source of truth. Never assume the stack or progress without checking.
   - Check [.docs/STATUS.md](.docs/STATUS.md) for the live project state, verified milestones, and next steps.
   - Consult [.docs/ANTIGRAVITY.md](.docs/ANTIGRAVITY.md) for complete Antigravity developer guidance and workflows.
   - Consult [.docs/reference/tech-stack.md](.docs/reference/tech-stack.md) before making architectural or library choices.

3. **Keep Project State in Sync:**
   - Whenever you complete a feature, test, or migration, update the relevant phase plan in `.docs/features/` and, for code changes, [.docs/CHANGELOG.md](.docs/CHANGELOG.md) and [.docs/FUNCTIONLOG.md](.docs/FUNCTIONLOG.md).
   - Update [.docs/STATUS.md](.docs/STATUS.md) only when the project's state actually moved — a table row or the Next list. It is a one-page snapshot (under ~150 lines); detail and verification narratives go in the CHANGELOG, not there.
   - Ensure handoffs between Antigravity and Claude Code remain seamless with clear notes on status, configuration, and next steps.
