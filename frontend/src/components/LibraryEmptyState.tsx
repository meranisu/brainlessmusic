import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { apiClient } from '../lib/apiClient';
import type { HealthSnapshot } from '../types/api';

/** Scan-status poll interval. Mounted only when there is nothing to show. */
const SCAN_POLL_MS = 2000;

/** "No music yet", shared by every browse surface. Page-specific empty states keep their own wording. */
export function LibraryEmptyState() {
  const { user } = useAuth();

  // `/admin/health` is open to every signed-in user, guests too, so this works on any empty screen.
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
