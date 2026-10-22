import type { ComponentType } from 'react';
import {
  DiscIcon,
  HeartIcon,
  HomeIcon,
  LibraryIcon,
  MicIcon,
  PeopleIcon,
  PlaylistIcon,
  TagIcon,
  TogetherIcon,
} from './icons';

export interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  /** The second line on the arcade card shown on the way in (`ArcadeInterstitial`). */
  detail?: string;
  icon: ComponentType<{ className?: string }>;
}

export interface NavSection {
  /** Shown over the section in the open sidebar; the rail draws a rule instead. */
  title: string;
  items: NavItem[];
}

/**
 * Every page the sidebar (A273), its rail (A275) and the phone's tab bar (A274) lead to, in one place so the three
 * never disagree. Order is the sidebar's, top to bottom, and sets the arcade card's direction.
 */
export function navSectionsFor(isGuest: boolean): NavSection[] {
  return [
    {
      title: 'Music',
      items: [
        { to: '/', label: 'Home', end: true, detail: 'Mixes, plays and new arrivals', icon: HomeIcon },
        { to: '/library', label: 'Library', detail: 'Every song on the server', icon: LibraryIcon },
        { to: '/albums', label: 'Albums', detail: 'Browse by cover art', icon: DiscIcon },
        { to: '/artists', label: 'Artists', detail: 'Everyone with a song here', icon: MicIcon },
        { to: '/genres', label: 'Genres', detail: 'Albums by genre tag', icon: TagIcon },
      ],
    },
    {
      title: 'Yours',
      items: [
        // Guests are listen-only (A37), but they see and play other people's public playlists (A163).
        ...(isGuest ? [] : [{ to: '/favorites', label: 'Favorites', detail: 'The songs you liked', icon: HeartIcon }]),
        {
          to: '/playlists',
          label: 'Playlists',
          detail: isGuest ? "Other people's public ones" : "Yours, and other people's public ones",
          icon: PlaylistIcon,
        },
        // Everyone, guests included (A100).
        { to: '/together', label: 'Listen together', detail: 'Same song, same moment', icon: TogetherIcon },
        // Everyone's profiles (A172), guests included: they can look, they just have none of their own.
        { to: '/people', label: 'People', detail: 'Who listens to what', icon: PeopleIcon },
      ],
    },
  ];
}

export function isItemActive(item: NavItem, pathname: string): boolean {
  return item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);
}

/** Which item the current URL belongs to, or -1 for a page that has none. */
export function activeIndex(items: NavItem[], pathname: string): number {
  return items.findIndex((item) => isItemActive(item, pathname));
}
