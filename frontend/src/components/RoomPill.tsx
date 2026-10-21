import { Link } from 'react-router-dom';
import { useRoom } from './RoomProvider';

/** "Room ABCD" above the cover on Now Playing while in a room (A262); opens the room page. */
export function RoomPill({ onOpen }: { onOpen?: () => void }) {
  const { room, connection } = useRoom();
  if (!room) return null;
  const live = connection === 'live';
  return (
    <Link
      to="/together"
      onClick={onOpen}
      className={`font-display inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-extrabold uppercase tracking-[0.18em] transition-colors ${
        live ? 'border-orange-600 text-orange-400 hover:bg-orange-600/15' : 'border-blue-700 text-blue-300'
      }`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-orange-500' : 'bg-blue-400'}`} />
      {live ? `Room ${room.code}` : 'Reconnecting…'}
    </Link>
  );
}
