# Review: tapping a song turns shuffle off, and the last mode (2026-10-12)

Covers commits `4500b62` (a tapped song turns shuffle off; "Keep shuffle" setting) and `7636e2d` (the shuffle buttons
come back to the last mode, A82), shipped in Android v0.3.15. Nothing crashes or loses data; these are open to fix.
Line numbers are as of `7636e2d`, so check them before editing.

## Worth fixing

- [ ] **T1. Albums and artists have no Shuffle button.** A tapped song now turns shuffle off, but the album and
  artist pages only offer tapping a song (`android/.../ui/albums/`, `ui/artists/`: no shuffle entry). Shuffling an
  album means tapping a song, then the Now Playing button, which also starts from that song. Playlists have a Shuffle
  button (`ui/profile/PlaylistDetailScreen.kt:129`, `playQueue(..., shuffle = true)`), and so does YouTube Music on
  albums and artists. Fix: add the same button to both pages.
- [ ] **T2. Upgrading users can lose their mode on the first tap.** `lastShuffleMode` falls back to Shuffle when
  `last_shuffle_mode` was never written (`android/.../data/local/PlaybackSettings.kt:58-61`). Someone who had
  Rediscover or Albums on before v0.3.15 has no such key, so the first tap turns shuffle off and shuffle all then plays
  plain Shuffle. Fix: when the key is missing, fall back to `shuffle_mode` if it is not OFF.
- [ ] **T3. The v0.3.15 release notes overstate it.** They list the Now Playing button among the shuffle buttons,
  then say "the shuffle buttons bring that back" (`android/release-notes/v0.3.15.md:3-6`); that button still goes
  off → Shuffle. Fix the file, then `gh release edit v0.3.15 --notes-file android/release-notes/v0.3.15.md`.

## Minor

- [ ] **T4. The Now Playing button and shuffle all start from different modes.** After a tap turns shuffle off,
  shuffle all comes back in the last mode, but the button cycles from off to Shuffle (`cycleShuffle()` →
  `wantMode.next()`). That is A82 as written; ask the owner before changing it.
- [ ] **T5. No unit test covers the new rules**: a tap turns shuffle off, "Keep shuffle" keeps it, the shuffle
  buttons use the last mode. Only `compileDebugKotlin` and the existing 43 tests were run.

## Checked and fine

Every song-tap path passes `shuffle = null` and so turns shuffle off (Songs, album, playlist, search, top tracks,
favourites); shuffle all and a playlist's Shuffle turn it on; "Play next" and Undo into an empty queue keep it as it
was; turning shuffle on from the notification or Bluetooth uses the last mode; the one-row Songs fetch only happens
when the tap really will play shuffled (`shufflesOnTap()`).
