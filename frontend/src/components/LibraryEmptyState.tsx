import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { apiClient } from '../lib/apiClient';
import type { HealthSnapshot } from '../types/api';

/**
 * How often this checks whether a scan is still running. Only mounted while
 * the caller has already confirmed there is nothing to show, so a real
 * library never pays for this.
 */
const SCAN_POLL_MS = 2000;

/**
 * The "there is no music yet" state, shared by every browse surface — the
 * arcade select, Albums, Artists — so it reads and looks the same wherever
 * the reason is the library itself being empty. A page-specific empty state
 * ("no albums for this artist", "nothing matched your search", "nothing
 * favorited yet") is a different situation and keeps its own wording.
 */
export function LibraryEmptyState() {
  const { user } = useAuth();

  // `/admin/health` is open to any signed-in user, guest included, unlike
  // the root-management endpoints themselves — this works from every screen
  // that can end up empty, not just admin-only ones.
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => apiClient.get<HealthSnapshot>('/admin/health'),
    refetchInterval: SCAN_POLL_MS,
  });

  if (health?.librarySyncRunning) {
    return (
      <div className="py-16 text-center">
        <p className="text-lg text-blue-100">Scanning for music…</p>
        <div className="mx-auto mt-4 h-1.5 w-56 overflow-hidden rounded-full bg-blue-800">
          <div className="scan-sweep h-full w-2/5 rounded-full bg-orange-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="py-16 text-center">
      <p className="text-lg text-blue-100">No music in the library yet.</p>
      {user?.isAdmin ? (
        <p className="mt-1 text-sm text-blue-400">
          Add a folder in{' '}
          <Link to="/options" className="text-orange-500 underline hover:text-orange-400">
            Options
          </Link>{' '}
          and it will show up here.
        </p>
      ) : (
        <p className="mt-1 text-sm text-blue-400">Ask an admin to add some.</p>
      )}
    </div>
  );
}
