// PreToolUse(Bash): blocks commands that repeat past incidents. Exit 2 = block, stderr goes to Claude.
import { readFileSync } from 'node:fs';

let cmd = '';
try {
  cmd = String(JSON.parse(readFileSync(0, 'utf8'))?.tool_input?.command ?? '');
} catch {
  process.exit(0);
}

const rules = [
  {
    when: () =>
      /\b(tsx|node)\b[^|;&\n]*(--test\b|\.test\.ts\b)/.test(cmd) && !/\bnpm\s+(run\s+)?test\b/.test(cmd),
    why: 'Run tests only with `cd backend && npm test`. A direct test run resolved to the real LIBRARY_PATH and destroyed the owner\'s library on 2026-09-09.',
  },
  {
    when: () =>
      /\brm\s+-[a-zA-Z]*[rf][a-zA-Z]*\b[^|;&\n]*(LIBRARY_PATH|ARTWORK_PATH|UPLOAD_STAGING_PATH|DB_PATH|libraryPath|artworkPath|\/home\/abcde\/music|\/mnt\/)/.test(cmd),
    why: 'Refusing a recursive delete aimed at a library, artwork, database or mount path. Delete only directories you created (makeTempDir()).',
  },
  {
    when: () =>
      /\.env(?![.\w-]*example)(\s|$|["'])/.test(cmd) &&
      /\b(cat|less|more|head|tail|grep|rg|sed|awk|source|cp|base64|strings|xxd)\b/.test(cmd),
    why: 'Do not read .env files; they hold secrets. Use .env.example for variable names.',
  },
  {
    when: () =>
      /\bdocker\s+(compose\s+)?(rm|kill|stop|restart|rmi|system\s+prune|volume\s+(rm|prune)|network\s+prune|container\s+prune)\b/.test(cmd) &&
      !/brainless/.test(cmd),
    why: 'This project only touches its own `brainless-*` containers. Name the brainless container explicitly, or ask the owner.',
  },
];

const hit = rules.find((r) => r.when());
if (hit) {
  process.stderr.write(`Blocked by .claude/hooks/guard-bash.mjs: ${hit.why}\n`);
  process.exit(2);
}
process.exit(0);
