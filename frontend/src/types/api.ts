export interface User {
  id: number;
  username: string;
  isAdmin: boolean;
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
  playCount: number;
}

export interface TrackDetail extends TrackSummary {
  trackNumber: number | null;
  fileSize: number;
  bitrate: number | null;
  sampleRate: number | null;
  dateAdded: string;
  lastPlayedAt: string | null;
  lastStreamError: string | null;
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
