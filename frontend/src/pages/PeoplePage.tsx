import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/Avatar';
import { Skeleton, SkeletonListRows } from '../components/Skeleton';
import { apiClient } from '../lib/apiClient';
import { formatSince } from '../lib/format';
import type { Person } from '../types/api';

/** Everyone on the server with a profile, most recently listening first (A170). */
export function PeoplePage() {
  const { user } = useAuth();
  const { data, isLoading, isError, dataUpdatedAt } = useQuery({
    queryKey: ['people'],
    queryFn: () => apiClient.get<{ people: Person[] }>('/people'),
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-white">People</h1>
        <p className="text-sm text-blue-300">Everyone on this server. Open someone to see what they listen to.</p>
      </div>

      {isLoading && (
        <Skeleton label="Loading people…">
          <SkeletonListRows rows={4} />
        </Skeleton>
      )}
      {isError && <p className="text-sm text-red-300">Could not load people. Reload to try again.</p>}

      {data && (
        <ul className="card divide-y divide-blue-800/60 overflow-hidden">
          {data.people.map((p) => (
            <li key={p.id}>
              <Link
                to={`/people/${p.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-blue-800/40 focus-visible:bg-blue-800/40"
              >
                <Avatar userId={p.id} name={p.name} avatarId={p.avatarId} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-white">
                    {p.name}
                    {p.id === user?.id && <span className="ml-2 text-xs font-normal text-blue-400">you</span>}
                  </span>
                  <span className="block truncate text-xs text-blue-300">
                    {p.bio ?? (p.lastPlayedAt ? `Listened ${formatSince(p.lastPlayedAt, dataUpdatedAt)}` : 'Nothing played yet')}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
