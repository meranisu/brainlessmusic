export interface User {
  id: number;
  username: string;
  /** What to call this user (A68): their chosen name, a guest's `Guest 1234`, or else `username`. */
  displayName: string;
  isAdmin: boolean;
  /** A guest: no password, so once its token is gone it can't be reached. Options offers a handoff first. */
  isGuest: boolean;
  /** Whether the account has a passcode. Never true for a guest. */
  hasPasscode: boolean;
  /** Web theme id (A55), or `null` if this profile never chose one. */
  theme: string | null;
  /** Profile picture (A167), or `null` for the initial tile. Always `null` for a guest. */
  avatarId: string | null;
  /** Null asks for one (A190). Always `null` for a guest, who is never asked. */
  email: string | null;
  /** Left out of friends' now playing and the feed (A241). Always `false` for a guest. */
  hideActivity: boolean;
}

export interface TrackSummary {
  id: number;
  title: string;
  artist: string | null;
  album: string | null;
  /** With `trackNumber`, tells "the next track of this album" apart (A72, gapless albums). */
  albumId: number | null;
  trackNumber: number | null;
  duration: number | null;
  /** dB that levels this track's loudness; null until the server has measured it. */
  gainDb: number | null;
  format: string | null;
  hidden: boolean;
  notRecommended: boolean;
  /** The file is gone from disk. */
  missing: boolean;
  /** Failed to stream last time; may play now. See `TrackDetail.lastStreamError`. */
  hasStreamError: boolean;
  playCount: number;
  dateAdded: string;
}

export interface PlaybackState {
  /** Unplayable tracks already removed server-side. */
  queue: TrackSummary[];
  queueIndex: number;
  positionSeconds: number;
  updatedAt: string;
  /** Tracks were dropped while loading, so this queue is shorter than the saved one. */
  queueRepaired: boolean;
}

export interface TrackDetail extends TrackSummary {
  trackNumber: number | null;
  fileSize: number;
  bitrate: number | null;
  sampleRate: number | null;
  lastPlayedAt: string | null;
  lastStreamError: string | null;
  /** When the file was first observed absent, or `null` while it is present. */
  missingSince: string | null;
}

export interface TrackListResponse {
  total: number;
  limit: number;
  offset: number;
  tracks: TrackSummary[];
}

export type SortField = 'title' | 'artist' | 'album' | 'duration' | 'dateAdded' | 'playCount';
export type SortOrder = 'asc' | 'desc';
export type VisibilityFilter = 'all' | 'only' | 'exclude';

export interface TrackListParams {
  search?: string;
  sort?: SortField;
  order?: SortOrder;
  hidden?: VisibilityFilter;
  notRecommended?: VisibilityFilter;
  missing?: VisibilityFilter;
  limit?: number;
  offset?: number;
}

export interface TrackPatchInput {
  title?: string;
  artist?: string | null;
  album?: string | null;
  trackNumber?: number | null;
  hidden?: boolean;
  notRecommended?: boolean;
}

export interface StreamErrorEntry {
  timestamp: string;
  trackId: number;
  message: string;
}

export interface HealthSnapshot {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  activeStreams: number;
  activeTranscodes: number;
  recentErrors: StreamErrorEntry[];
  missingTracks: number;
  /** True while any registered library root is mid-scan or mid-reconcile. */
  librarySyncRunning: boolean;
}

/** Names who failed and on which client, so it's admin-only. 'client' = decode failure; 'server' = the stream refused. */
export interface PlaybackFailureEntry {
  id: number;
  trackId: number;
  trackTitle: string | null;
  userId: number;
  username: string;
  source: 'client' | 'server';
  message: string;
  mediaErrorCode: number | null;
  contentType: string | null;
  userAgent: string | null;
  createdAt: string;
}

/** A player that checked in within the last 30 s: who is listening to what, and on which device. */
export interface Listener {
  userId: number;
  username: string;
  client: string;
  trackId: number;
  trackTitle: string;
  positionSeconds: number;
  since: string;
}

export interface DiskUsage {
  label: string;
  path: string;
  totalBytes: number;
  freeBytes: number;
}

export interface SystemStats {
  memoryBytes: number;
  heapUsedBytes: number;
  /** The server process only, per core; ffmpeg isn't counted. */
  cpuPercent: number;
  disks: DiskUsage[];
  transcodeCache: { usedBytes: number; maxBytes: number };
}

/** A file the last scan of a library root couldn't read. */
export interface ScanFailureEntry {
  id: number;
  rootId: number;
  rootLabel: string | null;
  rootPath: string;
  path: string;
  message: string;
  createdAt: string;
}

/** Everyone's listening over one rolling window. A skip counts toward minutes, never toward plays. */
export interface PlayWindow {
  plays: number;
  skips: number;
  listeners: number;
  minutes: number;
}

export interface ControlCenterSnapshot {
  system: SystemStats;
  listeners: Listener[];
  scanFailures: ScanFailureEntry[];
  scanFailureCount: number;
  /** The last 24 hours and the last 7 days. */
  plays: { day: PlayWindow; week: PlayWindow };
}

/** `GET /admin/rooms`: live "Listen together" rooms with each member's last reported drift (`services/rooms.ts`). */
export interface AdminRoomsResponse {
  serverNow: number;
  rooms: {
    code: string;
    createdAt: number;
    hostUserId: number;
    current: number;
    queue: { entryId: number; title: string; artist: string | null }[];
    playback: { playing: boolean };
    members: {
      userId: number;
      name: string;
      kind: 'account' | 'guest';
      connected: boolean;
      /** Positive is ahead of the room. Null until the first report, and while away. */
      driftMs: number | null;
      buffering: boolean;
    }[];
  }[];
}

/** `GET /library/stats` (A52). `hidden` and `missing` come only for an admin. */
export interface LibraryStats {
  tracks: number;
  seconds: number;
  bytes: number;
  formats: { format: string | null; tracks: number; bytes: number }[];
  hidden?: number;
  missing?: number;
}

export interface LibraryRoot {
  id: number;
  path: string;
  label: string | null;
  addedAt: string;
  lastScannedAt: string | null;
  status: 'ok' | 'unreachable';
  trackCount: number;
  scanning: boolean;
  /** `null` when not scanning or still walking folders; `scanning` tells them apart. */
  scanProgress: { processed: number; total: number } | null;
}

export interface LibraryRootListResponse {
  roots: LibraryRoot[];
}

export interface LibraryScanSummary {
  filesFound: number;
  filesAdded: number;
  filesUpdated: number;
  filesFailed: number;
  unreadableDirs: number;
  durationMs: number;
  failures: { path: string; error: string }[];
}

export interface LibraryReconcileSummary {
  checked: number;
  newlyMissing: number;
  recovered: number;
  missingTotal: number;
  strandedOutsideRoot: number;
  unreadable: number;
  aborted?: string;
  durationMs: number;
}

export interface LibraryRootScanResult {
  scan?: LibraryScanSummary;
  reconcile?: LibraryReconcileSummary;
}

export interface AddLibraryRootResponse extends LibraryRootScanResult {
  root: { id: number; path: string; label: string | null };
}

export interface BrowseDirEntry {
  name: string;
  path: string;
}

export interface BrowseDirResponse {
  path: string;
  parent: string | null;
  entries: BrowseDirEntry[];
  truncated?: boolean;
}

export interface ArtistSummary {
  id: number;
  name: string;
  trackCount: number;
  albumCount: number;
}

export interface AlbumSummary {
  id: number;
  title: string;
  artistId: number | null;
  artistName: string | null;
  year: number | null;
  trackCount: number;
}

export interface ArtistDetail extends ArtistSummary {
  /** Albums they are the album artist of. */
  albums: AlbumSummary[];
  /** Other artists' albums with a song of theirs (A149). Absent from a server before v0.4. */
  appearsOn?: AlbumSummary[];
}

/** The artist fields are the song's own, which on a compilation differ from the album's (v0.4). */
export interface AlbumTrack {
  id: number;
  title: string;
  artistId?: number | null;
  artistName?: string | null;
  trackNumber: number | null;
  /** Null when untagged, played as disc 1. */
  discNumber?: number | null;
  duration: number | null;
  gainDb: number | null;
  format: string | null;
}

export interface AlbumDetail {
  id: number;
  /** The id asked for, when a rescan merged that album into this one. */
  mergedFrom?: number;
  title: string;
  artistId: number | null;
  artistName: string | null;
  year: number | null;
  tracks: AlbumTrack[];
}

export interface GenreSummary {
  id: number;
  name: string;
  trackCount: number;
  albumCount: number;
}

export interface GenreListResponse {
  genres: GenreSummary[];
}

export interface GenreDetail extends GenreSummary {
  albums: AlbumSummary[];
}

export interface ArtistListResponse {
  total: number;
  limit: number;
  offset: number;
  artists: ArtistSummary[];
}

export interface AlbumListResponse {
  total: number;
  limit: number;
  offset: number;
  albums: AlbumSummary[];
}

export interface FavoriteTrack extends TrackSummary {
  favoritedAt: string;
}

export interface FavoriteListResponse {
  total: number;
  limit: number;
  offset: number;
  favorites: FavoriteTrack[];
}

/** One run of the title-sorted song list (`GET /browse/letters`): where a rail letter starts and how many rows it holds. */
export interface LetterEntry {
  /** `#` (digits, punctuation), `A` to `Z`, then a bucket per other script (`…`, `À`, `Ω`, `Я`, `あ`, `ア`, `漢`, `한`). */
  letter: string;
  /** Index of the run's first row; where it would be when empty (the next row that exists). */
  offset: number;
  count: number;
}

export interface LetterIndex {
  scope: string;
  total: number;
  letters: LetterEntry[];
}

export interface PlaylistSummary {
  id: number;
  name: string;
  /** What it is, in the owner's words (A185); null without one. */
  description: string | null;
  trackCount: number;
  createdAt: string;
  /** Everyone signed in on this server can see, play and copy it (A162). */
  isPublic: boolean;
  /** Filled by rules each time it opens, not by hand (A207). Always private. */
  isSmart: boolean;
  /** Up to four albums, in playlist order, for a cover mosaic (A147). */
  coverAlbumIds: number[];
}

/** Someone else's public playlist (`GET /playlists/public`), newest public first (A166). */
export interface PublicPlaylistSummary extends PlaylistSummary {
  ownerId: number;
  ownerName: string;
  publicAt: string;
}

/** A playlist in search results: the viewer's own, or someone's public one. */
export interface PlaylistSearchResult {
  id: number;
  name: string;
  trackCount: number;
  ownerId: number;
  ownerName: string;
  isPublic: boolean;
  isSmart: boolean;
  /** The viewer's own. */
  isOwner: boolean;
  coverAlbumIds: number[];
}

export interface PlaylistTrack {
  id: number;
  title: string;
  artist: string | null;
  album: string | null;
  albumId: number | null;
  trackNumber: number | null;
  duration: number | null;
  gainDb: number | null;
  format: string | null;
  position: number;
}

export interface PlaylistDetail {
  id: number;
  name: string;
  /** What it is, in the owner's words (A185); null without one. */
  description: string | null;
  ownerId: number;
  ownerName: string;
  createdAt: string;
  isPublic: boolean;
  /** False for someone else's public playlist: read-only, with Save a copy (A162). */
  isOwner: boolean;
  /** Its tracks come from `rules` each time it opens (A207). */
  isSmart: boolean;
  rules: SmartRules | null;
  tracks: PlaylistTrack[];
}

/** One smart playlist rule (A207). The server checks these against a fixed list of fields and ops. */
export type SmartRule =
  | { field: 'myPlays' | 'year'; op: 'lt' | 'gt' | 'eq'; value: number }
  | { field: 'lastPlayed' | 'dateAdded'; op: 'olderThanDays' | 'withinDays'; value: number }
  | { field: 'lastPlayed'; op: 'never' }
  | { field: 'liked' | 'disliked'; op: 'is'; value: boolean }
  | { field: 'genre'; op: 'is' | 'isNot'; value: string }
  | { field: 'artist'; op: 'is' | 'contains'; value: string }
  | { field: 'duration'; op: 'lt' | 'gt'; value: number };

export type SmartSort = 'random' | 'lastPlayedAsc' | 'myPlaysDesc' | 'myPlaysAsc' | 'dateAddedDesc' | 'title';

export interface SmartRules {
  v: 1;
  match: 'all' | 'any';
  rules: SmartRule[];
  sort: SmartSort;
  limit: number;
}

/** `POST /playlists/smart/preview`: what the rules would pick right now, the first 50 of them. */
export interface SmartPreview {
  trackCount: number;
  tracks: PlaylistTrack[];
}

/** `GET /search?q=`: results by kind, each capped server-side. */
export interface SearchResults {
  artists: ArtistSummary[];
  albums: AlbumSummary[];
  tracks: TrackSummary[];
  /** The viewer's own and everyone's public ones, own first (A162). */
  playlists: PlaylistSearchResult[];
  /** Accounts whose name matches, to reach their profile (A172). */
  people: Person[];
  /** Whether each kind has more than it shows, for "See all". */
  hasMore?: Record<SearchKind, boolean>;
  /** The best match, shown big with Play; null when nothing matched. */
  top?: { kind: 'artist' | 'album' | 'track'; id: number } | null;
  /** "Did you mean …?" when nothing matched and a name is close. */
  suggestion?: string | null;
}

export type SearchKind = 'tracks' | 'artists' | 'albums' | 'playlists' | 'people';

/** `GET /search?type=`: one kind's page, for "See all". */
export interface SearchKindPage<T> {
  type: SearchKind;
  items: T[];
  hasMore: boolean;
  offset: number;
}

export interface UserSummary {
  id: number;
  username: string;
  /** Chosen name, else `username`. */
  displayName: string;
  isAdmin: boolean;
  createdAt: string;
  /** A guest can be turned into an account with an invite (A107). */
  kind: 'account' | 'guest';
  /** Last time the app checked in (`GET /auth/me`); null if never. SQLite UTC. */
  lastSeenAt: string | null;
  /** Plays in the last 7 days; skips don't count. */
  plays7d: number;
}

/** An account invite on the Users page (A107-A112). Dates are SQLite UTC strings. */
export interface AccountInvite {
  id: number;
  createdAt: string;
  expiresAt: string;
  status: 'open' | 'used' | 'expired' | 'revoked';
  guestUserId: number | null;
  guestName: string | null;
  usedBy: string | null;
}

/** One per-guest entry code on the admin panel (A42/A43). Dates are SQLite UTC strings. */
export interface GuestCode {
  id: number;
  code: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  /** The guest's internal username. */
  usedBy: string | null;
  /** The guest's display name. */
  usedByName: string | null;
  /** `used`: bound to a guest that still exists, and works on any device (A69). */
  status: 'active' | 'used' | 'expired';
  /** Newest first, at most 20. */
  signins: GuestCodeSignin[];
}

/** One sign-in with a guest code (A69). `platform` is null when the client didn't say. */
export interface GuestCodeSignin {
  at: string;
  platform: 'web' | 'android' | null;
  userAgent: string | null;
  ip: string | null;
}

/** A guest's "Request a code" waiting for the admin (A67). */
export interface GuestCodeRequest {
  id: number;
  name: string | null;
  platform: 'web' | 'android' | null;
  ip: string | null;
  createdAt: string;
}

export interface GuestCodesSnapshot {
  /** The admin toggle: does the guest door ask for a code? */
  required: boolean;
  /** Whether the shared `ENTRY_CODE` is set on the server. Its value is never sent. */
  sharedCodeSet: boolean;
  codes: GuestCode[];
  /** Pending requests, oldest first. */
  requests: GuestCodeRequest[];
}

/** Where a song stands in volume levelling (`GET /admin/loudness`). */
export type LoudnessStatus = 'levelled' | 'waiting' | 'failed';

export interface TrackLoudness {
  id: number;
  title: string;
  artist: string | null;
  album: string | null;
  status: LoudnessStatus;
  loudnessLufs: number | null;
  loudnessPeak: number | null;
  /** Null for a levelled song only when it is silent. */
  gainDb: number | null;
}

export interface LoudnessReport {
  summary: { total: number; levelled: number; waiting: number; failed: number };
  /** The background pass is working through the waiting songs. */
  running: boolean;
  measuring: { id: number; title: string; artist: string | null } | null;
  total: number;
  tracks: TrackLoudness[];
  limit: number;
  offset: number;
}

/** `GET /people` (A170): every account, most recently listening first. */
export interface Person {
  id: number;
  name: string;
  avatarId: string | null;
  bio: string | null;
  lastPlayedAt: string | null;
}

export type StatsRange = 'week' | 'month' | 'year' | 'all';

/** `GET /users/:id/profile` (A167-A170). Liked and disliked are shown to everyone (A168). */
export interface Profile {
  id: number;
  name: string;
  /** Your own profile only: others see the display name alone (A174). */
  username?: string;
  isAdmin?: boolean;
  isSelf: boolean;
  memberSince: string;
  bio: string | null;
  avatarId: string | null;
  favoriteTrack: TrackSummary | null;
  favoriteArtist: { id: number; name: string } | null;
  range: StatsRange;
  totals: { plays: number; msListened: number; tracks: number; artists: number };
  topTracks: { track: TrackSummary; plays: number; msListened: number }[];
  topArtists: { id: number; name: string; plays: number; msListened: number }[];
  topAlbums: { id: number; title: string; artist: string | null; plays: number }[];
  topGenres: { id: number; name: string; plays: number }[];
  /** Public ones, or all of yours. */
  playlists: PlaylistSummary[];
  liked: { total: number; tracks: TrackSummary[] };
  disliked: { total: number; tracks: TrackSummary[] };
}

type StatsTotals = { plays: number; msListened: number; tracks: number; artists: number };

/** `GET /me/stats`: your own listening over a range, with the window before it for comparison (A91). */
export interface MyStats {
  range: StatsRange;
  since: string | null;
  memberSince: string;
  totals: StatsTotals;
  /** Same length, just before; null for all time. */
  previousTotals: StatsTotals | null;
  topTracks: { track: TrackSummary; plays: number; msListened: number; previousRank?: number | null }[];
  topArtists: { id: number; name: string; plays: number; msListened: number; previousRank?: number | null }[];
  topAlbums: { id: number; title: string; artist: string | null; plays: number; msListened: number }[];
  topGenres: { id: number; name: string; plays: number }[];
  counts: { liked: number; lessOften: number; playlists: number };
}

export interface PatternBucket {
  plays: number;
  msListened: number;
}

/** `GET /me/stats/patterns`: when you listen, in the zone sent as `tz`. Plays leave out skips; time includes them. */
export interface ListeningPatterns {
  range: StatsRange;
  tz: string;
  /** Daily for week, month and year; weekly (Monday first) for all time (A229). */
  bucket: 'day' | 'week';
  byHour: PatternBucket[];
  /** Monday first. */
  byWeekday: PatternBucket[];
  trend: (PatternBucket & { date: string; skips: number })[];
  /** In days, over all time whatever the range. */
  streak: { current: number; longest: number; longestEndedOn: string | null };
  busiest: { hour: number | null; weekday: number | null; day: { date: string; plays: number } | null };
}

/** One row of `GET /me/history`, newest first. */
export interface HistoryEntry {
  id: number;
  trackId: number;
  title: string;
  artist: string | null;
  album: string | null;
  albumId: number | null;
  trackNumber: number | null;
  duration: number | null;
  gainDb: number | null;
  format: string | null;
  playedAt: string;
  msPlayed: number | null;
  missing: number;
  skipped: number;
}

export interface HistoryPage {
  total: number;
  limit: number;
  offset: number;
  history: HistoryEntry[];
}

/** Someone in friends' now playing or the feed (A239): display name only. */
export interface SocialPerson {
  id: number;
  name: string;
  avatarId: string | null;
}

/** `GET /social/now-playing`: other accounts playing right now. */
export interface FriendListening {
  person: SocialPerson;
  track: TrackSummary;
  positionSeconds: number;
  /** When they started this song, ISO. */
  since: string;
  /** The Listen together room they're in, so their card can offer Join (A255). Missing from an older server. */
  roomCode?: string | null;
}

/** `GET /rooms/invites`: an invite to a room, answered by joining it or declining (A255). */
export interface RoomInvite {
  code: string;
  from: SocialPerson;
  members: string[];
  nowPlaying: { title: string; artist: string | null } | null;
  expiresAt: number;
}

/** `GET /social/feed`: plays (one per person per song per day), likes, playlists made public. `at` is SQLite UTC. */
export type FeedItem =
  | { kind: 'play' | 'like'; at: string; person: SocialPerson; track: TrackSummary }
  | { kind: 'playlist'; at: string; person: SocialPerson; playlist: { id: number; name: string; trackCount: number } };

export interface FeedPage {
  items: FeedItem[];
  nextBefore: string | null;
}
