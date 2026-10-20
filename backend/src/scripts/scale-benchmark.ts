import { execFile } from 'node:child_process';
import { mkdir, readFile, stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { makeTempDir } from '../testing/tempDir.js';

/**
 * Times scans of a synthetic library and samples memory: `npm run bench:scale -- --tracks 50000`.
 *
 * Everything lives in one `makeTempDir()` directory, removed at the end unless `--keep` is passed. The data paths are
 * pointed into it *before* `config.ts` is imported (it reads them once, on import), so no step can reach the real
 * library or database. Files are one ffmpeg-made MP3 with a hand-written ID3v2.3 tag in front, since running ffmpeg
 * 50,000 times would take longer than the scans being measured.
 */

const run = promisify(execFile);

const TRACKS_PER_ALBUM = 10;
const ALBUMS_PER_ARTIST = 5;
const GENRES = ['Rock', 'Jazz', 'Electronic', 'Hip-Hop', 'Classical', 'Folk', 'Metal', 'Pop'];
const WRITE_CONCURRENCY = 64;
/** Share of files given a new mtime before the "some changed" rescan. */
const TOUCHED_SHARE = 0.01;

function parseArgs(argv: string[]): { tracks: number; keep: boolean } {
  let tracks = 50_000;
  let keep = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--tracks') tracks = Number(argv[++i]);
    else if (argv[i] === '--keep') keep = true;
  }
  if (!Number.isInteger(tracks) || tracks < 1) throw new Error('--tracks needs a positive whole number');
  return { tracks, keep };
}

/** ID3v2.3 sizes in the header are 7 bits per byte. */
function synchsafe(n: number): Buffer {
  return Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);
}

function textFrame(id: string, text: string): Buffer {
  const body = Buffer.concat([Buffer.from([0x00]), Buffer.from(text, 'latin1')]);
  const header = Buffer.alloc(10);
  header.write(id, 0, 'latin1');
  header.writeUInt32BE(body.length, 4);
  return Buffer.concat([header, body]);
}

function id3Tag(tags: Record<string, string>): Buffer {
  const frames = Buffer.concat(Object.entries(tags).map(([id, text]) => textFrame(id, text)));
  return Buffer.concat([Buffer.from('ID3'), Buffer.from([3, 0, 0]), synchsafe(frames.length), frames]);
}

async function makeTemplateAudio(dir: string): Promise<Buffer> {
  const path = join(dir, 'template.mp3');
  await run('ffmpeg', [
    '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
    '-map_metadata', '-1', '-id3v2_version', '0', '-b:a', '64k', path,
  ]);
  return readFile(path);
}

async function writeLibrary(root: string, tracks: number, audio: Buffer): Promise<void> {
  const jobs: Array<() => Promise<void>> = [];
  for (let i = 0; i < tracks; i++) {
    const albumIndex = Math.floor(i / TRACKS_PER_ALBUM);
    const artistIndex = Math.floor(albumIndex / ALBUMS_PER_ARTIST);
    const artist = `Artist ${artistIndex + 1}`;
    const album = `Album ${albumIndex + 1}`;
    const trackNo = (i % TRACKS_PER_ALBUM) + 1;
    const dir = join(root, artist, album);
    jobs.push(async () => {
      await mkdir(dir, { recursive: true });
      const tag = id3Tag({
        TIT2: `Song ${i + 1}`,
        TPE1: artist,
        TALB: album,
        TRCK: String(trackNo),
        TCON: GENRES[artistIndex % GENRES.length],
        TYER: String(1970 + (albumIndex % 50)),
      });
      await writeFile(join(dir, `${String(trackNo).padStart(2, '0')}.mp3`), Buffer.concat([tag, audio]));
    });
  }
  for (let i = 0; i < jobs.length; i += WRITE_CONCURRENCY) {
    await Promise.all(jobs.slice(i, i + WRITE_CONCURRENCY).map((job) => job()));
  }
}

/** Samples resident memory while `fn` runs; the peak is what a small server would have to fit. */
async function measure<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number; peakRssMb: number }> {
  let peak = process.memoryUsage().rss;
  const timer = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage().rss);
  }, 50);
  const start = performance.now();
  try {
    const result = await fn();
    peak = Math.max(peak, process.memoryUsage().rss);
    return { result, ms: performance.now() - start, peakRssMb: peak / 1024 / 1024 };
  } finally {
    clearInterval(timer);
  }
}

async function main(): Promise<void> {
  const { tracks, keep } = parseArgs(process.argv.slice(2));
  const scratch = await makeTempDir('scale-bench');
  const library = join(scratch.path, 'library');
  const data = join(scratch.path, 'data');

  process.env.DB_PATH = join(data, 'bench.db');
  process.env.LIBRARY_PATH = library;
  process.env.ARTWORK_PATH = join(data, 'artwork');
  process.env.AVATAR_PATH = join(data, 'avatars');
  process.env.UPLOAD_STAGING_PATH = join(data, 'staging');
  process.env.BACKUP_PATH = join(data, 'backups');

  try {
    const { config } = await import('../config.js');
    if (!config.dbPath.startsWith(scratch.path) || !config.libraryPath.startsWith(scratch.path)) {
      throw new Error(`Refusing to run: config did not pick up the scratch paths (db=${config.dbPath})`);
    }
    const { db, closeDb } = await import('../db/connection.js');
    const { runMigrations } = await import('../db/migrator.js');
    const { insertLibraryRoot } = await import('../db/libraryRoots.js');
    const { scanLibrary, reconcileMissingTracks } = await import('../services/scanner.js');

    console.log(`Scratch directory: ${scratch.path}`);
    console.log(`Writing ${tracks.toLocaleString()} tracks...`);
    const audio = await makeTemplateAudio(scratch.path);
    const written = await measure(() => writeLibrary(library, tracks, audio));
    console.log(`  written in ${(written.ms / 1000).toFixed(1)} s`);

    runMigrations({ silent: true });
    const root = insertLibraryRoot(library, 'bench');
    const quiet = { info: () => {}, warn: (msg: string) => console.warn(`  warn: ${msg}`) };
    const scan = (full: boolean) => scanLibrary(library, root.id, config.artworkPath, undefined, quiet, { full });

    const rows: Array<{ step: string; ms: number; peakRssMb: number; detail: string }> = [];
    const record = (step: string, m: { ms: number; peakRssMb: number }, detail: string) => {
      rows.push({ step, ms: m.ms, peakRssMb: m.peakRssMb, detail });
      console.log(`  ${step}: ${(m.ms / 1000).toFixed(1)} s`);
    };

    console.log('Measuring...');
    const cold = await measure(() => scan(false));
    record('First scan (empty DB)', cold, `${cold.result.filesAdded} added, ${cold.result.filesFailed} failed`);

    const idle = await measure(() => scan(false));
    record('Rescan, nothing changed', idle, `${idle.result.filesUnchanged} unchanged`);

    const touched = Math.max(1, Math.round(tracks * TOUCHED_SHARE));
    const later = new Date(Date.now() + 60_000);
    const sample = (db.prepare('SELECT path FROM tracks ORDER BY id LIMIT ?').all(touched) as Array<{ path: string }>);
    await Promise.all(sample.map((r) => utimes(r.path, later, later)));
    const some = await measure(() => scan(false));
    record(`Rescan, ${touched} files touched`, some, `${some.result.filesUpdated} updated, ${some.result.filesUnchanged} unchanged`);

    const full = await measure(() => scan(true));
    record('Full rescan (?full=1)', full, `${full.result.filesUpdated} updated`);

    const reconcile = await measure(() => reconcileMissingTracks(library, root.id));
    record('Missing-file check', reconcile, `${reconcile.result.checked} checked`);

    const counts = db
      .prepare('SELECT (SELECT COUNT(*) FROM tracks) t, (SELECT COUNT(*) FROM albums) al, (SELECT COUNT(*) FROM artists) ar')
      .get() as { t: number; al: number; ar: number };
    db.pragma('wal_checkpoint(TRUNCATE)');
    closeDb();
    const dbMb = (await stat(config.dbPath)).size / 1024 / 1024;

    console.log('');
    console.log(`Library: ${counts.t.toLocaleString()} tracks, ${counts.al.toLocaleString()} albums, ${counts.ar.toLocaleString()} artists`);
    console.log(`Database file: ${dbMb.toFixed(1)} MB. Node ${process.version}, ${process.platform}.`);
    console.table(
      rows.map((r) => ({
        step: r.step,
        seconds: Number((r.ms / 1000).toFixed(2)),
        'files/s': r.step.startsWith('Missing') ? '' : Math.round(tracks / (r.ms / 1000)),
        'peak RSS MB': Math.round(r.peakRssMb),
        result: r.detail,
      })),
    );
  } finally {
    if (keep) console.log(`Kept: ${scratch.path}`);
    else await scratch.cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
