export interface User {
  id: number;
  username: string;
  isAdmin: boolean;
  /** A guest: no password, so once its token is gone it can't be reached. Options offers a handoff first. */
  isGuest: boolean;
  /** Whether the account has a passcode. Never true for a guest. */
  hasPasscode: boolean;
}

export interface TrackSummary {
  id: number;
  title: string;
  artist: string | null;
  album: string | null;
  duration: number | null;
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

/** One open stream: who is listening to what. */
export interface ActiveSession {
  id: number;
  userId: number;
  username: string;
  trackId: number;
  trackTitle: string;
  startedAt: string;
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

export interface ControlCenterSnapshot {
  system: SystemStats;
  activeSessions: ActiveSession[];
  scanFailures: ScanFailureEntry[];
  scanFailureCount: number;
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
  albums: AlbumSummary[];
}

/** Album track rows omit the artist, which is the album's. */
export interface AlbumTrack {
  id: number;
  title: string;
  trackNumber: number | null;
  duration: number | null;
  format: string | null;
}

export interface AlbumDetail {
  id: number;
  title: string;
  artistId: number | null;
  artistName: string | null;
  year: number | null;
  tracks: AlbumTrack[];
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

export interface PlaylistSummary {
  id: number;
  name: string;
  trackCount: number;
  createdAt: string;
}

export interface PlaylistTrack {
  id: number;
  title: string;
  artist: string | null;
  album: string | null;
  duration: number | null;
  format: string | null;
  position: number;
}

export interface PlaylistDetail {
  id: number;
  name: string;
  ownerId: number;
  createdAt: string;
  tracks: PlaylistTrack[];
}

/** `GET /search?q=`: results by kind, each capped server-side. */
export interface SearchResults {
  artists: ArtistSummary[];
  albums: AlbumSummary[];
  tracks: TrackSummary[];
}

export interface UserSummary {
  id: number;
  username: string;
  isAdmin: boolean;
  createdAt: string;
}

/** One per-guest entry code on the admin panel (A42/A43). Dates are SQLite UTC strings. */
export interface GuestCode {
  id: number;
  code: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  usedBy: string | null;
  status: 'active' | 'used' | 'expired';
}

export interface GuestCodesSnapshot {
  /** The admin toggle: does the guest door ask for a code? */
  required: boolean;
  /** Whether the shared `ENTRY_CODE` is set on the server. Its value is never sent. */
  sharedCodeSet: boolean;
  codes: GuestCode[];
}
