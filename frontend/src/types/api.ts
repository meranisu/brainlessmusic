export interface User {
  id: number;
  username: string;
  isAdmin: boolean;
  /**
   * Minted by the title screen's enter button rather than signed into. Has no
   * password and cannot be logged back into once its token is gone — which is
   * why the header offers a guest a handoff rather than a "log out".
   */
  isGuest: boolean;
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
  /** The file is gone from disk — nothing can play this until it comes back. */
  missing: boolean;
  playCount: number;
  dateAdded: string;
}

export interface PlaybackState {
  /** Already filtered server-side — anything unplayable is gone from this. */
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

export interface LibraryRoot {
  id: number;
  path: string;
  label: string | null;
  addedAt: string;
  lastScannedAt: string | null;
  status: 'ok' | 'unreachable';
  trackCount: number;
  scanning: boolean;
}

export interface LibraryRootListResponse {
  roots: LibraryRoot[];
}

export interface LibraryScanSummary {
  filesFound: number;
  filesAdded: number;
  filesUpdated: number;
  filesFailed: number;
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

/** Album track rows omit the artist — it's the album's, carried on the parent. */
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

/** `GET /search?q=` — results grouped by kind, each list capped server-side. */
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
