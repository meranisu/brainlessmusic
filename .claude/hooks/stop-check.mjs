// Stop: type-checks packages touched this session and flags missing doc updates. Exit 2 = Claude must address it once.
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

let input = {};
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const session = String(input.session_id ?? 'x').replace(/[^\w-]/g, '');
const listFile = join(tmpdir(), `brainless-touched-${session}.txt`);
const tracked = existsSync(listFile) ? readFileSync(listFile, 'utf8').split('\n').filter(Boolean) : [];
rmSync(listFile, { force: true });
if (input.stop_hook_active) process.exit(0); // second pass: never loop

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// PostToolUse only sees Edit/Write, so shell edits are caught by also reading the working tree (Q40).
// That can include someone else's uncommitted work: an extra check, never a missed one.
const status = spawnSync('git', ['status', '--porcelain', '-uall', '-z'], { cwd: root, encoding: 'utf8' });
const dirty = [];
if (status.status === 0) {
  const entries = status.stdout.split('\0');
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.length < 4) continue;
    dirty.push(join(root, entry.slice(3)));
    if (entry[0] === 'R' || entry[0] === 'C') i++; // the next entry is the old path, with no status prefix
  }
}

const touched = [...new Set([...tracked, ...dirty])];
if (touched.length === 0) process.exit(0);
const has = (re) => touched.some((f) => re.test(f));
const problems = [];

const tsc = (dir, args) => {
  const r = spawnSync('npx', ['--no-install', 'tsc', ...args], {
    cwd: join(root, dir),
    encoding: 'utf8',
    timeout: 150_000,
  });
  if (r.status !== 0) {
    const out = `${r.stdout}${r.stderr}`.split('\n').filter(Boolean).slice(0, 15).join('\n');
    problems.push(`${dir} does not type-check (first lines):\n${out}`);
  }
};

const backendCode = has(/\/backend\/src\/.*\.ts$/);
const frontendCode = has(/\/frontend\/src\/.*\.tsx?$/);
if (backendCode) tsc('backend', ['--noEmit', '-p', 'tsconfig.json']);
if (frontendCode) tsc('frontend', ['--noEmit', '-p', 'tsconfig.app.json']);

const codeChanged = has(/\/(backend|frontend)\/src\/(?!.*\.test\.)/);
if (codeChanged && !has(/\.docs\/CHANGELOG\.md$/)) {
  problems.push('Code changed but .docs/CHANGELOG.md was not updated (and FUNCTIONLOG.md for new/changed functions). Add the entries, or say why this change needs none.');
}
if (has(/\/db\/migrations\/.*\.sql$/) && !has(/database-schema\.md$/)) {
  problems.push('A migration changed but .docs/reference/database-schema.md was not updated.');
}

if (problems.length) {
  process.stderr.write(`Stop check (.claude/hooks/stop-check.mjs):\n- ${problems.join('\n- ')}\n`);
  process.exit(2);
}
process.exit(0);
