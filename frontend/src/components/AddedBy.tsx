import { Avatar } from './Avatar';

/** A room queue row's "whose song is this": the adder's picture, named for screen readers and on hover (A256). */
export function AddedBy({ person }: { person: { userId: number; name: string; avatarId: string | null } }) {
  const label = person.name ? `Added by ${person.name}` : 'Added by someone who left';
  return (
    <span title={label} className="shrink-0">
      <Avatar userId={person.userId} name={person.name || '?'} avatarId={person.avatarId} size="xs" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
