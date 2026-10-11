/**
 * What changed on the web app, per version, newest first. Opened from "VER" on the title screen (owner request,
 * 2026-10-11). Plain and short, like `android/release-notes/`: what someone using the site would notice, not the
 * engineering detail (that's `.docs/CHANGELOG.md`).
 *
 * When `frontend/package.json`'s version goes up, add its entry here in the same change. The newest entry should
 * match `__APP_VERSION__`; `ChangelogDialog` marks it as the version you're on.
 */

export interface WebRelease {
  version: string;
  /** YYYY-MM-DD */
  date: string;
  changes: string[];
}

export const WEB_CHANGELOG: WebRelease[] = [
  {
    version: '0.3.0',
    date: '2026-10-11',
    changes: [
      'Listen together: start a room, send the six-letter code, and everyone in it hears the same song at the same moment. Anyone can pause, skip or change the queue, guests included.',
      'In a room the player shows the room code, and shuffle and repeat are off. Pressing Play on a song adds it after the current one for everyone.',
      'Admins: the Control Center has its own button at the top right, and Upload and Users are tabs inside it. The old Upload and Users links still work.',
      'Admins: the Control Center shows live rooms and how close each person is to the room.',
      "Admins: uploads keep going while you use other pages. Long upload lists scroll in their own box, and failed ones get a separate box saying what went wrong, with Retry all.",
      "Uploading a file that isn't really audio is refused instead of added as a song that never plays. .wav and .aac can be picked on the upload page.",
      'A back-to-top button shows up on long pages.',
      'An expired sign-in now takes you back to the sign-in screen instead of leaving things half working.',
      'This list. Click the version on the title screen any time to see it.',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-10-11',
    changes: [
      'Where this list starts: the arcade title screen, music select, themes, uploads and tag editing, and the Control Center were all in by here. Notes begin with 0.3.0.',
    ],
  },
];
