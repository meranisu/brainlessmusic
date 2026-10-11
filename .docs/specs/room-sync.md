# Spec: Room sync

**Status:** Agreed (2026-10-11); steps 1 (backend) and 2 (web) built 2026-10-11, steps 3–5 not started
**Layers:** 🔧 Backend / 🌐 Web / 📱 Android

Roadmap boxes 21 (this spec), 22 (backend) and 23 (clients). *Done when (v0.3):* two people in different places hear
the same song at the same time, and either can skip it. *Done when (this spec):* it answers "what happens when
someone's phone loses signal for 30 seconds" without hand-waving; see [The 30-second test](#the-30-second-test).

## Problem

Everything so far is one person, one player. v0.3 is about listening with friends: one shared queue, everyone
hearing the same moment of the same song, anyone able to pause or skip. No reference implementation exists to copy
(tech-stack.md), so the hard parts (clocks, drift, dropped connections) are decided here before any code.

## What exists today (checked 2026-10-11)

- **No WebSocket code anywhere.** `backend/package.json` has neither `ws` nor `@fastify/websocket`; no SSE either.
  Android has no WebSocket client. The stack is already chosen: `ws` / Fastify WebSocket on the server, OkHttp
  WebSocket on Android (tech-stack.md).
- **Auth:** session JWTs carry `{sub, username, sv}`, no role or guest flag (`backend/src/services/token.ts:14`),
  7-day lifetime (`config.ts:8`). `rejectStaleSession` re-reads the user row so a deleted user or changed password
  is refused at once (`plugins/auth.ts:33`). Guest vs account is `users.kind` (`db/users.ts:13`); `requireAccount`
  turns guests away (`plugins/auth.ts:89`).
- **Streaming:** `GET /api/tracks/:id/stream` (`routes/tracks.ts:372`) with Range, ETag and `?quality=low`. The web
  passes a 2 h media token as `?token=` (`routes/auth.ts:442`, `token.ts:24`); Android uses its Bearer header.
- **In-memory state pattern:** `services/streamMonitor.ts` keeps Maps of live sessions with a 30 s TTL (`:37`, `:56`).
  The server is one process (`index.ts:38`), so an in-memory room registry is enough (tech-stack.md: room state is
  in memory, not SQLite).
- **Web player:** all in `frontend/src/components/PlayerBar.tsx` (`PlayerProvider`, `:248`): a `QueueTrack[]` plus
  index, two `Audio` elements for preload and crossfade (`:428-429`), seek via `currentTime` (`:960`).
- **Android player:** `playback/PlaybackController.kt`: one ExoPlayer in a MediaSession (`:81`), a second `tail`
  player for crossfade (`:841`), downloaded copies served first through `CacheDataSource` (`:890-895`), UI through
  `StateFlow<PlaybackUiState>` (`:154`).
- **Plays:** `POST /api/tracks/:id/scrobble` behind `requireAccount` (`routes/tracks.ts:650`); both clients count a
  play at half the song or 240 s.
- **Tunnel:** cloudflared passes WebSockets through, but the deployment doc says nothing about idle timeouts.
  Cloudflare drops an idle WebSocket after about 100 s, so the protocol pings well inside that.

## Scope

**In:**
1. Make a room from the web or the phone; it starts from the creator's current queue and position.
2. Others join by typing a short room code. One room per person at a time.
3. One shared queue and one shared playback state. Anyone in the room can play, pause, seek, skip, go back, jump to a
   song, and add, remove or reorder songs (A101).
4. Every member hears the same position within about 0.3 s (see [Drift](#drift)).
5. Losing the connection doesn't stop the music; coming back puts you back in step.
6. Presence: who's in the room and who has dropped out.
7. A room monitor on the web Control Center: live rooms, members, and each member's measured drift.

**Out:**
- **Share links.** Sharing links are out of scope (decided); the code is read out or pasted in a chat.
- Same-room listening (two phones on one table). That needs drift in the tens of milliseconds, a different problem.
- Chat, reactions, votes to skip.
- Rooms that survive a server restart (in memory, decided; Redis is the noted future option).
- Crossfade inside a room. It is switched off while in a room; gapless preload stays. Two crossfading players
  behind a moving target is where the drift maths gets hard, and it can come back later.

## Design

### Model: the server holds the truth

The server owns each room's state. Clients never decide what is playing; they send commands, the server applies
them in arrival order, and everyone gets the new state. A client's job is to make its own player match that state.

```ts
type Room = {
  id: string;              // internal
  code: string;            // 6 letters, no look-alikes (no O/0, I/1), shown to people
  hostUserId: number;      // creator; host only ends the room and removes people
  members: Map<userId, Member>;
  queue: QueueEntry[];     // { entryId, trackId, addedBy } — entryId makes duplicates of one song distinct
  current: number;         // index into queue, -1 when empty
  playback: {
    playing: boolean;
    positionMs: number;    // position at anchorMs
    anchorMs: number;      // server clock time when positionMs was true
  };
  version: number;         // +1 on every change
};
type Member = { userId; username; kind: 'account' | 'guest'; connected: boolean; lastSeenMs; driftMs?: number };
```

Where the song should be right now, on the server clock:
`playing ? positionMs + (now - anchorMs) : positionMs`. Every client computes the same thing using its estimate of
the server clock. That one formula is the whole sync scheme; everything below keeps it accurate.

### Clock sync

Phones and PCs disagree about the time by up to seconds. Each client estimates `offset = serverClock - localClock`
the way NTP does: it sends `ping {t0}`, the server answers `pong {t0, ts}`, the client notes `t1` on arrival.
`offset = ts - (t0 + t1) / 2`, `rtt = t1 - t0`.

- On connect: 8 pings, 100 ms apart. Keep the offset from the 3 lowest-RTT samples (median). Low-RTT samples have
  the least room for error.
- Then one ping every 3 s for half a minute, then every 20 s. The burst runs while the page is still loading, which
  delays handling the replies; in testing that put the first estimate 0.5 s off, so the early pings replace it with
  quieter samples. The 20 s pings also keep the WebSocket inside Cloudflare's ~100 s idle limit. The server also
  sends a WebSocket protocol ping every 30 s and drops a socket that missed the last one, so a phone that vanished
  without closing shows as away within a minute.
- The offset is always the median of the 3 lowest-RTT samples from the last 2 minutes, so one slow round trip on
  mobile data doesn't knock anyone out of step.
- Client time uses a monotonic clock (`performance.now()` on the web, `SystemClock.elapsedRealtime()` on Android), so
  the phone's own clock changing mid-session doesn't matter.

### Drift

Once a second, each client compares its player's position to where the song should be.

| Off by | What the client does |
|---|---|
| under 300 ms | Nothing. |
| 300 ms or more, twice in a row | Seek to the right position, plus this device's seek lead (below). |

Why so loose: the members are in different places and can't hear each other's speakers, so a few hundred
milliseconds is inaudible. What matters is "did you hear that bit?" over a call or chat. Seeking only after two
readings stops one bad reading from causing a skip. Gently speeding up or slowing down (instead of seeking) is the
better fix if seeks turn out to be audible; it's left for after the first walkthrough, since both players support it
(`playbackRate`, `PlaybackParameters`).

**Seek lead.** Starting or seeking takes a device a moment before sound actually moves, so aiming at the exact
position always lands behind it (about 0.7 s in headless Chromium). After each start or correction the client measures
how far off it landed and aims that much further ahead next time, learned per device, between 0 and 1 s.

Each client reports its measured drift every 5 s (`status`). The room monitor shows it, so "are we in sync" is a
number, not a feeling.

### Starting a song, and the end of a song

- **New song** (skip, jump, previous, end of song): the server sets `anchorMs = now + 1500`, `positionMs = 0`. The 1.5 s
  lead gives every client time to load the song before it is due. A client that is ready early waits; a client that
  is late starts when it can and seeks to catch up. Nobody waits for the slowest member.
- **The server ends songs**, not the clients. It knows every song's duration from the database and runs a timer for
  the current one. Clients ignore their own player's "ended" event in a room. Otherwise five members would send five
  "it ended" messages and the room would skip five songs.
- Clients preload the next song as they already do; that is what makes the 1.5 s lead enough on slow networks.
- End of queue: the room pauses at the end of the last song. Nothing auto-plays.

### Commands and conflicts

Every command names what the sender saw, so two people pressing the same button at the same moment do one thing,
not two:

| Command | Carries | Ignored when |
|---|---|---|
| `play`, `pause` | — | already in that state |
| `seek {positionMs}` | `entryId` | that song isn't current any more |
| `next`, `previous` | `entryId` | that song isn't current any more (so two skips = one skip) |
| `previous` past 3 s | `entryId` | restarts the song instead of going back, like every player |
| `jump {entryId}` | — | entry is gone |
| `add {trackIds[], after?}` | — | queue would pass 500 songs, or any song is hidden, missing or has no known length (the server can't end a song it can't time); none of the batch is added |
| `remove {entryId}`, `move {entryId, toIndex}` | — | entry is gone |
| `end`, `kick {userId}` | — | sender isn't the host |

An ignored command gets `rejected {clientCmdId, reason}` back so the client can undo any optimistic display.
Otherwise there is no locking: last command wins, which matches what people expect from a shared remote.

### Protocol

REST for things that happen once, one WebSocket for the live part.

- `POST /api/rooms` → `{ code }`. Body: `{ trackIds, current, positionMs, playing }` from the creator's player.
- `GET /api/rooms/:code` → `{ code, members, nowPlaying }` or 404, for the "join" screen.
- `GET /api/rooms/mine` → `{ code }` or `{ code: null }`, so a restarted client knows it was in a room.
- `GET /api/admin/rooms` → all rooms for the monitor (`requireAdmin`).
- `GET /api/rooms/ws`, the WebSocket.

**WebSocket auth:** browsers can't put headers on a WebSocket, and a token in the URL ends up in logs. So the socket
opens without auth and the first message must be `hello {token, code}` within 5 s, or the server closes it. The
server verifies the token exactly as `authenticate` does, including the `session_version` check. Android sends the
same `hello`; once Cloudflare Access is on, its service-token headers go on the upgrade request like any other (Q77).

**Messages** (JSON, `{type, ...}`):

| Direction | Type | Contents |
|---|---|---|
| client → server | `hello` | `token`, `code` |
| | `ping` | `t0` |
| | `cmd` | `clientCmdId`, `op`, args from the table above |
| | `status` | `driftMs`, `buffering` |
| | `leave` | — |
| server → client | `welcome` | full room snapshot, `you`, `serverNow` |
| | `state` | full room snapshot (rooms are small; no diffs) |
| | `pong` | `t0`, `ts` |
| | `rejected` | `clientCmdId`, `reason` |
| | `closed` | `reason`: `ended`, `kicked`, `not-found`, `replaced` (you joined from another device) |

A snapshot of a 500-song queue is about 40 KB, sent only when something changes. Fine for a handful of people.

### Membership and lifetimes

- Max 8 members. One room per user: joining a second room, or joining the same one from a second device, takes over
  and the old socket gets `closed {replaced}`.
- A member whose socket drops is marked away, not removed, for 2 minutes. After that they're removed.
- If the host is removed or leaves, the longest-present member becomes host.
- A room is deleted when its last member is removed, so at most 2 minutes after the last person drops out. A
  room made but never opened goes the same way: its creator starts as an away member.
- **Plays:** each account member's client records its own plays with the existing scrobble call, as today. Guests
  don't record plays (A37).

### Clients

Both clients get a "room mode" in the player they already have, not a second player:

- In room mode the player follows the room state. The transport buttons and queue edits send commands instead of
  acting locally.
- Joining replaces your queue with the room's. **Leaving keeps playing** the room's queue on your own from where it
  was, so leaving never cuts the music off mid-song.
- Data saver and downloads still apply per device: a downloaded song plays from the phone, and data saver still asks
  for `?quality=low`. Quality is per listener, so it doesn't affect anyone else.
- Crossfade is off in room mode (see Out); the setting comes back when you leave.
- Android: the room socket lives with `PlaybackController` in the foreground service, so a locked phone stays in the
  room. Lock-screen buttons send room commands.
- Web: a room view (members, code, queue). Admins also get the monitor in Control Center.

## The 30-second test

*Someone's phone loses signal for 30 seconds in the middle of a song.*

1. **0 s.** The socket stops getting pongs. The phone notices at the next ping (within 20 s) or when OkHttp reports
   the socket failed, whichever comes first. The room banner says "Reconnecting…" and the room buttons are greyed
   out. Commands are not queued up to send later; a skip pressed into the void would land 30 s late and surprise
   everyone.
2. **The music keeps playing.** The phone keeps following the last state it had, using its clock offset, which
   stays valid offline. It keeps playing what's buffered (ExoPlayer holds up to about 50 s ahead) or the downloaded
   copy. If the room's song ends during the outage, the phone moves to the next song in the queue it last saw,
   since that's almost always what the server did too.
3. **The server side.** The member shows as away to everyone else. Nothing waits for them. The room carries on.
4. **Reconnect** (backing off 1 s, 2 s, 4 s, capped at 10 s, as long as the room might still exist). The phone sends
   `hello`, gets `welcome` with the current snapshot and re-runs the 8-ping clock sync.
5. **Catch up.** If the song is the same, the normal drift rule applies: one seek if it's 300 ms or more out. If
   someone skipped meanwhile, it switches to the room's current song at the right position. Buttons come back.
6. **If the buffer ran dry** during the outage, the player stalls, and on reconnect it jumps to where the room is,
   not to where it stalled. The room never rewinds for one person.
7. **Gone longer than 2 minutes:** the server has removed them. `hello` puts them straight back in as a new member,
   as long as the room still exists. If the room is gone (deleted, or the server restarted), they get
   `closed {not-found}`, and the phone keeps playing the queue on its own, as if they had left.

## Build order

| Step | What | Done when |
|---|---|---|
| 1 | Backend: room registry, REST, WebSocket, clock pings, server-side song timer, tests with two fake clients and a fake clock | `npm test` covers join, double-skip, reconnect, host handover, room expiry. **Built 2026-10-11:** `services/rooms.ts`, `routes/rooms.ts` |
| 2 | Web room mode + room view | Two browser tabs stay in sync (roadmap box 22's done-when), drift readout under 300 ms. **Built 2026-10-11:** `lib/roomClient.ts`, `RoomProvider`, `TogetherPage` (`/together`), room mode in `PlayerBar`; two headless Chromium sessions measured within ±0.25 s |
| 3 | Control Center room monitor | Shows rooms, members, drift |
| 4 | Android room mode | Phone and browser in sync; screen-off keeps the room |
| 5 | Walkthrough | Two people, two places, one skips: the v0.3 done-when |

## Decisions

A100 (guests join with full controls, no plays recorded), A101 (everyone does everything; host ends the room and
removes people), A102 ("Listen together" in the UI), A103 (this spec replaces Q4), all in
[QUESTIONS.md](../QUESTIONS.md#answered).

## Related

- [development-roadmap.md](../process/development-roadmap.md) boxes 21–23
- [tech-stack.md](../reference/tech-stack.md): in-memory room state, `ws`, OkHttp WebSocket
- [cloudflare-tunnel-deployment.md](../ops/cloudflare-tunnel-deployment.md) and Q77: Access on the WebSocket
- [offline-downloads.md](offline-downloads.md): downloaded copies still play in a room
