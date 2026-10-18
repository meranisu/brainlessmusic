import { Fragment, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useDialogA11y } from '../hooks/useDialogA11y';
import { useScrollLock } from '../hooks/useScrollLock';
import androidReleases from '../lib/androidChangelog.json';
import { WEB_CHANGELOG } from '../lib/webChangelog';
import { CloseIcon } from './icons';

/**
 * "What's new", opened from the version on the title screen: one tab for the website, one for the Android app (owner
 * request, 2026-10-11). Web notes live in `lib/webChangelog.ts`; Android's come from `android/release-notes/*.md`
 * through `scripts/android-notes.mjs`, so they're written once. Escape, the backdrop or Close shut it.
 */

interface AndroidRelease {
  version: string;
  date: string;
  sections: { title: string; blocks: ({ type: 'p'; text: string } | { type: 'ul'; items: string[] })[] }[];
}

type Tab = 'web' | 'android';
const TABS: { id: Tab; label: string }[] = [
  { id: 'web', label: 'Web' },
  { id: 'android', label: 'Android app' },
];

/** The release notes' only markup: **bold** and `code`. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, i) =>
        part.startsWith('**') ? (
          <strong key={i} className="font-semibold text-white">
            {part.slice(2, -2)}
          </strong>
        ) : part.startsWith('`') ? (
          <code key={i} className="rounded bg-blue-950 px-1 font-mono text-xs">
            {part.slice(1, -1)}
          </code>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

function ReleaseHeading({ version, date, badge }: { version: string; date: string; badge?: string }) {
  return (
    <h3 className="flex flex-wrap items-baseline gap-x-2">
      <span className="font-display text-2xl font-extrabold text-white">{version}</span>
      <span className="text-xs text-blue-300">{date}</span>
      {badge && <span className="badge-caution">{badge}</span>}
    </h3>
  );
}

const listClass = 'mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm text-blue-100 marker:text-orange-600';

function WebNotes() {
  return WEB_CHANGELOG.map((release) => (
    <section key={release.version} className="mb-6 last:mb-0">
      <ReleaseHeading
        version={release.version}
        date={release.date}
        badge={release.version === __APP_VERSION__ ? 'This version' : undefined}
      />
      <ul className={listClass}>
        {release.changes.map((change) => (
          <li key={change}>{change}</li>
        ))}
      </ul>
    </section>
  ));
}

/** Where the release workflow (`.github/workflows/android-release.yml`) publishes the signed APK. The repo is public. */
const RELEASES_REPO = 'meranisu/brainlessmusic';
const RELEASES_PAGE = `https://github.com/${RELEASES_REPO}/releases/latest`;

type LatestApk = { state: 'loading' } | { state: 'ready'; tag: string; url: string; bytes: number } | { state: 'failed' };

/**
 * The newest APK, asked of GitHub when the Android tab opens (not on every title-screen visit). The file name carries
 * the version (`brainlessmusic-v0.3.27.apk`), so a fixed "latest/download" link can't point at it.
 */
function DownloadApk() {
  const [apk, setApk] = useState<LatestApk>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch(`https://api.github.com/repos/${RELEASES_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((release: { tag_name: string; assets: { name: string; browser_download_url: string; size: number }[] }) => {
        const file = release.assets.find((a) => a.name.endsWith('.apk'));
        if (cancelled) return;
        setApk(file ? { state: 'ready', tag: release.tag_name, url: file.browser_download_url, bytes: file.size } : { state: 'failed' });
      })
      .catch(() => {
        if (!cancelled) setApk({ state: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mb-5 rounded-lg border border-blue-700 bg-blue-950 p-4">
      <p className="text-sm font-medium text-white">Get the app</p>
      {apk.state === 'loading' && <p className="mt-1 text-sm text-blue-300">Checking the latest release…</p>}
      {apk.state === 'ready' && (
        <>
          <a href={apk.url} className="btn-primary btn-md mt-3">
            Download {apk.tag} ({(apk.bytes / 1024 / 1024).toFixed(1)} MB)
          </a>
          <p className="mt-2 text-xs text-blue-300">
            Open it on your phone and allow installs from your browser when asked. It installs over an older version.
          </p>
        </>
      )}
      {apk.state === 'failed' && (
        <p className="mt-1 text-sm text-blue-200">
          Couldn't reach GitHub just now.{' '}
          <a href={RELEASES_PAGE} target="_blank" rel="noreferrer" className="text-accent-ink underline underline-offset-2">
            Open the releases page
          </a>{' '}
          to download it there.
        </p>
      )}
    </div>
  );
}

function AndroidNotes() {
  return (androidReleases as AndroidRelease[]).map((release, index) => (
    <section key={release.version} className="mb-6 last:mb-0">
      {/* The site can't know which version a phone has, so the newest is marked instead. */}
      <ReleaseHeading version={release.version} date={release.date} badge={index === 0 ? 'Latest' : undefined} />
      {release.sections.map((section, s) => (
        <div key={s} className="mt-2">
          {section.title && (
            <h4 className="text-xs font-semibold text-blue-200 first-letter:uppercase">{section.title}</h4>
          )}
          {section.blocks.map((block, b) =>
            block.type === 'p' ? (
              <p key={b} className="mt-1.5 text-sm text-blue-100">
                <Inline text={block.text} />
              </p>
            ) : (
              <ul key={b} className={listClass}>
                {block.items.map((item, i) => (
                  <li key={i}>
                    <Inline text={item} />
                  </li>
                ))}
              </ul>
            ),
          )}
        </div>
      ))}
    </section>
  ));
}

export function ChangelogDialog({ onClose }: { onClose: () => void }) {
  useScrollLock();
  const [tab, setTab] = useState<Tab>('web');
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ web: null, android: null });
  const panelRef = useRef<HTMLDivElement>(null);

  function choose(next: Tab) {
    setTab(next);
    panelRef.current?.scrollTo({ top: 0 });
  }

  // Left and right move between the two tabs, the usual tab-list keys.
  function onTabKey(event: ReactKeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const next: Tab = tab === 'web' ? 'android' : 'web';
    choose(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="motion-scrim fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby="changelog-title"
        className="card flex max-h-[85vh] w-full max-w-lg flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          <h2 id="changelog-title" className="text-base font-semibold text-white">
            What's new
          </h2>
          <button onClick={onClose} autoFocus className="btn-ghost btn-sm h-9 w-9 px-0!" aria-label="Close">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div role="tablist" aria-label="Which app" className="mt-2 flex gap-1 border-b border-blue-800 px-5" onKeyDown={onTabKey}>
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              role="tab"
              id={`changelog-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="changelog-panel"
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => choose(t.id)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'border-orange-600 text-white'
                  : 'border-transparent text-blue-300 hover:border-blue-500 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {/* Scrolls inside, so a long history never pushes Close off a phone screen. */}
        <div
          ref={panelRef}
          id="changelog-panel"
          role="tabpanel"
          aria-labelledby={`changelog-tab-${tab}`}
          tabIndex={0}
          className="overflow-y-auto overscroll-contain px-5 py-4"
        >
          {tab === 'web' ? (
            <WebNotes />
          ) : (
            <>
              <DownloadApk />
              <AndroidNotes />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
