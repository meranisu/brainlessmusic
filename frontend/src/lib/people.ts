import type { UserSummary } from '../types/api';

/** A person's role in one word, as the Users tab shows it. */
export function roleLabel(person: UserSummary): string {
  if (person.kind === 'guest') return 'Guest';
  return person.isAdmin ? 'Admin' : 'Listener';
}
