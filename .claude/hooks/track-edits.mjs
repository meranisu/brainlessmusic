// PostToolUse(Edit|Write|MultiEdit): records touched files so the Stop hook checks only what this session changed.
import { readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const file = input?.tool_input?.file_path;
  const session = String(input?.session_id ?? 'x').replace(/[^\w-]/g, '');
  if (file) appendFileSync(join(tmpdir(), `brainless-touched-${session}.txt`), `${file}\n`);
} catch {
  // tracking is best-effort; never block an edit
}
process.exit(0);
