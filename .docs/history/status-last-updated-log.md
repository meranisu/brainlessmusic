# STATUS.md "Last updated" log

Old `_Last updated:_` header text moved out of [../STATUS.md](../STATUS.md) so the live header holds only the latest state.
Newest first. Not maintained beyond moving text here; some entries say "not pushed" for work that was pushed later.

## Up to 2026-10-21 (moved 2026-10-21)

2026-10-21: Android Now Playing tidy-up A268 built: scrolling title, no "Unknown album", room chip in the top bar, room shuffle/repeat for the host; compiles, uncommitted, not phone-checked
2026-10-21: Listen together round 1 fixes pushed in ef01f64, tag v0.4.30, CI green, release build running at close, smol deploy not checked; not browser- or phone-checked

2026-10-21: Room issue log pushed in ea1ff62, tag v0.4.29, release and CI green, live on smol; release APK checked with dexdump; not phone-checked.

2026-10-21: Android rooms R8 fix and room code beside Now playing pushed in 9970910, tag v0.4.28, release green; regenerated `androidChangelog.json` pushed in 9931d72, CI was running at close, smol deploy not checked; not phone-checked

2026-10-21: Listen together v2 and Add to queue pushed with tag v0.4.27 and web 0.4.1, CI green after 21e2e72, smol deploy not checked; v0.4.25 and v0.4.26 pushed; everything from e612988 to 8d08134 live on smol, Android v0.4.24 released; none of it phone-checked; rescan and audio analysis progress on smol not checked

2026-10-21: Listen together v2 and Add to queue in 5a3fa4b, 3c79961, 6c09a53, pushed with tag v0.4.27 and web 0.4.1; CI and
the release were running at close; web browser-checked, Android compile only. Android tidy-up A251 in bf04520, tagged v0.4.26
with notes in 37e6684, pushed; CI and the v0.4.26 release green; compile only, not phone-checked. Profile tabs, Standard radar,
Listen together in the Library, letter rail bubble fix, mix pages and mixes filled to 30 in 0669c29, web 0.4.0 What's new in
4e21bd6, all pushed; CI and the Android v0.4.25 release were still running at close; not browser- or phone-checked. Everything
from e612988 to 8d08134 pushed, CI green, live on smol at 00:30 UTC (new routes answer 401); Android v0.4.24 tagged and
released; rescan and audio analysis progress on smol not checked.

Earlier, all later pushed in e612988..8d08134: on this day: past years' plays on today's date on backend, web and Android,
committed 27d6c32, not browser- or phone-checked; social layer part 1: friends' now playing and activity feed, committed
5f1ea0f, not browser- or phone-checked; smart auto-mixes: song radio, Keep playing, daily mixes on backend, web and Android,
committed c5e17fa, radio quality not yet judged on real data; Android update check hourly + background notification + waits
for intros, committed 8649f41; library list shows the saved copy at once on web and Android, committed 5e5b03f; Android album
art cache (A233), committed 4917b96; perf work, stats dashboard, Android prepare-next and 15-minute scans committed
e612988..c222f4b, held back until the owner said to push (A231).

Earlier still (2026-10-20): stats dashboard built on backend, web and Android, not phone-tested; SQLite tuning measured, gain
inside noise, left unchanged; scan commits 32 files per transaction, 1k bench 11.0 s to 3.2 s; missing-file check cleared at
10k; incremental scan, scale benchmark with 50k numbers, response compression and cover thumbnail ffmpeg cap built, one commit
later per A225 (became e612988).

2026-10-18: all of the day's commits pushed, Android v0.4.23 released, web motion pass, desktop Now Playing, review round 2
top-7 fixes.
