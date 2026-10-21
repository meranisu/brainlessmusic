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
    version: '0.4.1',
    date: '2026-10-21',
    changes: [
      'Listen together: the host has room settings for shuffle, repeat, take turns (one song from each person in rotation), and who may skip, play and pause, add songs, move or remove other people\'s songs, and invite.',
      'Skipping in a room is a vote by default. Whoever added the song, and the host, skip at once; anyone else\'s Next is a vote, and more than half of the room skips it (one vote with two of you).',
      'Every song in a room queue shows the picture of whoever added it.',
      'Invite people from the room (the host at first; they can let everyone invite). Invites show up as a banner with Join and Not now.',
      'Friends: someone in a room has a Join button next to what they\'re playing.',
      'Play next and Add to queue: the ⋮ on a song in the Library, an album, a playlist or search puts it right after the current song or at the end of the queue (in a room, the room\'s queue).',
    ],
  },
  {
    version: '0.4.0',
    date: '2026-10-21',
    changes: [
      'Your profile has tabs now: Profile, Stats and Friends. Stats and Friends left the More menu; old /stats and /friends links still land on the right tab.',
      'Stats: your top songs, artists and albums, when in the day and week you listen, your trend over time and your day streak.',
      'Mixes: up to six daily mixes in the library toolbar, built from what you play. Each has a cover made of its songs, and opening one lists its songs (up to 30) with Play and Shuffle.',
      'Start radio on any song, and Keep playing carries on with similar songs when the queue runs out (on by default).',
      "Friends: see what everyone is playing right now and a feed of their plays, likes and public playlists. One switch hides your own activity.",
      'On this day: a button in the library toolbar plays what you listened to on today\'s date in past years.',
      'The library list shows up straight away from the copy saved last time, then refreshes.',
      'A wide screen gets a full Now Playing view, and the queue can remove songs and show related ones.',
      'Pages and menus move more smoothly.',
      'Signing out clears the listening room, and signing in or out in another tab is picked up here too.',
    ],
  },
  {
    version: '0.3.1',
    date: '2026-10-18',
    changes: [
      'Passcodes are now 6 to 8 digits, and everyone starts fresh: your old passcode is cleared. Sign in with your password, then set a new passcode in Options.',
      'After 10 wrong passcodes, passcode sign-in locks until you sign in with your password. The screen tells you when that happens.',
      'The passcode pad is livelier: digits pop in, keys press down, and a wrong code shakes. Tapping Sign in with too few digits tells you what is needed.',
    ],
  },
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
