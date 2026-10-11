// Turns android/release-notes/vX.Y.Z.md into src/lib/androidChangelog.json for the web's "What's new" window, so the
// notes are written once, in the .md files. Runs before every `npm run build` (prebuild). The Docker build has no
// android/ folder (.dockerignore), so there it does nothing and the committed JSON is used: commit the JSON with notes.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const notesDir = join(here, '../../android/release-notes');
const outFile = join(here, '../src/lib/androidChangelog.json');

if (!existsSync(notesDir)) {
  console.log('android-notes: no android/release-notes here, keeping the committed androidChangelog.json');
  process.exit(0);
}

/** Sections of paragraphs and bullet lists. Continuation lines of a bullet are indented. */
function parse(markdown) {
  const sections = [];
  let section = null;
  let block = null;
  const ensureSection = () => {
    if (!section) sections.push((section = { title: '', blocks: [] }));
  };
  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd();
    if (line.startsWith('## ')) {
      sections.push((section = { title: line.slice(3).trim(), blocks: [] }));
      block = null;
    } else if (line.trim() === '') {
      if (block?.type === 'p') block = null;
    } else if (/^- /.test(line)) {
      ensureSection();
      if (block?.type !== 'ul') section.blocks.push((block = { type: 'ul', items: [] }));
      block.items.push(line.slice(2).trim());
    } else if (/^\s+\S/.test(line) && block?.type === 'ul') {
      block.items[block.items.length - 1] += ` ${line.trim()}`;
    } else {
      ensureSection();
      if (block?.type === 'p') block.text += ` ${line.trim()}`;
      else section.blocks.push((block = { type: 'p', text: line.trim() }));
    }
  }
  return sections;
}

/**
 * Today as git's `--date=short` writes it: the local calendar date, not UTC. Otherwise a note generated before it is
 * committed carries the UTC date and the committed one the local date, and CI's "JSON is committed" check fails.
 */
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** When the note was first committed, as the release date; today for one not committed yet. */
function dateOf(file) {
  try {
    const out = execFileSync('git', ['log', '--diff-filter=A', '--format=%ad', '--date=short', '--', file], {
      cwd: notesDir,
      encoding: 'utf8',
    }).trim();
    return out.split('\n').pop() || today();
  } catch {
    return today();
  }
}

const semver = (v) => v.split('.').map(Number);
const releases = readdirSync(notesDir)
  .filter((f) => /^v\d+\.\d+\.\d+\.md$/.test(f))
  .map((f) => ({
    version: f.slice(1, -3),
    date: dateOf(f),
    sections: parse(readFileSync(join(notesDir, f), 'utf8')),
  }))
  .sort((a, b) => {
    const [x, y] = [semver(a.version), semver(b.version)];
    return y[0] - x[0] || y[1] - x[1] || y[2] - x[2];
  });

const json = `${JSON.stringify(releases, null, 2)}\n`;
const previous = existsSync(outFile) ? readFileSync(outFile, 'utf8') : '';
if (json !== previous) writeFileSync(outFile, json);
console.log(`android-notes: ${releases.length} releases${json === previous ? ', unchanged' : ', written'}`);
