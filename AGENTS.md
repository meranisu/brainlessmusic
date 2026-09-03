# Antigravity Workspace Rules — brainlessmusic

Before taking action or modifying code in this workspace, adhere to the following rules:

1. **Co-working with Claude Code:**
   - You and Claude Code are pair-developing this project collaboratively.
   - Always run `git status` or inspect recent changes before writing code to avoid overwriting or conflicting with Claude Code's ongoing or uncommitted work (e.g., in `backend/` or `android/`).
   - Respect established conventions and implementations in [.docs/CLAUDE.md](.docs/CLAUDE.md) and [.docs/ANTIGRAVITY.md](.docs/ANTIGRAVITY.md).

2. **Cross-reference Documentation First:**
   - The `.docs/` directory is the single source of truth. Never assume the stack or progress without checking.
   - Check [.docs/STATUS.md](.docs/STATUS.md) for the live project state, verified milestones, and next steps.
   - Consult [.docs/ANTIGRAVITY.md](.docs/ANTIGRAVITY.md) for complete Antigravity developer guidance and workflows.
   - Consult [.docs/reference/tech-stack.md](.docs/reference/tech-stack.md) before making architectural or library choices.

3. **Keep Project State in Sync:**
   - Whenever you complete a feature, test, or migration, update [.docs/STATUS.md](.docs/STATUS.md) and relevant phase plans in `.docs/features/`.
   - Ensure handoffs between Antigravity and Claude Code remain seamless with clear notes on status, configuration, and next steps.
