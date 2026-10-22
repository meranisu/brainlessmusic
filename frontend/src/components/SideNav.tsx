import { useQuery } from '@tanstack/react-query';
import { useState, type FocusEvent, type MouseEvent } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { apiClient } from '../lib/apiClient';
import type { PlaylistSummary } from '../types/api';
import { CoverArt } from './CoverArt';
import { usePlayer } from './PlayerBar';
import { BrandMark, Wordmark } from './BrandLockup';
import { SidebarIcon } from './icons';
import { isItemActive, type NavItem, type NavSection } from './navItems';

interface SideNavProps {
  sections: NavSection[];
  pathname: string;
  /** Folded to the icon rail (A275). */
  collapsed: boolean;
  onToggle: () => void;
  /** A plain click on an item: the shell plays the arcade card and navigates. */
  onNavigate: (event: MouseEvent<HTMLAnchorElement>, item: NavItem) => void;
  /** Boot-stagger class for the item list, from the shell. */
  bootClass?: string;
}

/**
 * The arcade sidebar (A273): a game's mode-select column rather than a dashboard's. Flat blocks on the ground colour,
 * a solid edge, and the page you're on lit by an orange key at its left, the one thing that moves between pages.
 * Folded, it is a rail of icons whose names show at once beside them (A275). That name is one fixed element placed
 * by the item's position, not a CSS tooltip, so the rail can scroll on a short window without clipping it.
 */
export function SideNav({ sections, pathname, collapsed, onToggle, onNavigate, bootClass = '' }: SideNavProps) {
  const { user } = useAuth();
  const { current, isPlaying, openPlayer } = usePlayer();
  const isGuest = Boolean(user?.isGuest);

  // Same key as the Playlists page, so it shares that request and refreshes with it.
  const playlists = useQuery({
    queryKey: ['playlists'],
    queryFn: () => apiClient.get<{ playlists: PlaylistSummary[] }>('/playlists'),
    enabled: user != null && !isGuest,
  });
  const mine = playlists.data?.playlists ?? [];

  const [tip, setTip] = useState<{ text: string; top: number; left: number } | null>(null);

  /** Hover and focus handlers that name a rail item beside it. Nothing while the sidebar is open: the label shows. */
  function tipFor(text: string) {
    if (!collapsed) return {};
    const show = (event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
      const box = event.currentTarget.getBoundingClientRect();
      setTip({ text, top: box.top + box.height / 2, left: box.right + 10 });
    };
    const hide = () => setTip(null);
    return { onMouseEnter: show, onFocus: show, onMouseLeave: hide, onBlur: hide };
  }

  return (
    <aside
      className={`side-nav fixed inset-y-0 left-0 z-30 hidden select-none flex-col md:flex ${
        collapsed ? 'is-rail' : ''
      }`}
      aria-label="Main"
    >
      <div className="flex h-16 shrink-0 items-center gap-2 px-3 sm:h-[4.5rem]">
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Open the sidebar' : 'Fold the sidebar'}
          aria-keyshortcuts="["
          aria-expanded={!collapsed}
          data-tip={collapsed ? 'Open the sidebar  [' : 'Fold the sidebar  ['}
          className="tip tip-right side-toggle"
        >
          <SidebarIcon className="h-5 w-5" />
        </button>
        {!collapsed && (
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <BrandMark className="h-7 w-7 border-2 border-blue-200" />
            <Wordmark className="truncate text-base text-white" />
          </Link>
        )}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4" onScroll={() => setTip(null)}>
        {sections.map((section) => (
          <div key={section.title} className="side-section">
            {collapsed ? (
              <span aria-hidden className="side-rule" />
            ) : (
              <p className="side-heading">{section.title}</p>
            )}
            <ul className={`flex flex-col gap-1 ${bootClass}`}>
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={(event) => onNavigate(event, item)}
                    aria-label={collapsed ? item.label : undefined}
                    {...tipFor(item.label)}
                    className={({ isActive }) => `side-item ${isActive ? 'is-active' : ''}`}
                  >
                    {/* A real element in the active item only, so it can carry a `view-transition-name` and slide
                        between items. A duplicate name would disable the transition. */}
                    {isItemActive(item, pathname) && <span className="side-key" />}
                    <item.icon className="h-5 w-5 shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {/* Your own playlists, one click away like YT Music's (A273). Open only: the rail has no room for names. */}
        {!collapsed && mine.length > 0 && (
          <div className="side-section">
            <p className="side-heading">Your playlists</p>
            <ul className="flex flex-col">
              {mine.map((playlist) => {
                const here = pathname === `/playlists/${playlist.id}`;
                return (
                  <li key={playlist.id}>
                    <Link
                      to={`/playlists/${playlist.id}`}
                      aria-current={here ? 'page' : undefined}
                      className={`side-playlist ${here ? 'is-active' : ''}`}
                    >
                      <span className="truncate">{playlist.name}</span>
                      {playlist.isSmart && <span className="shrink-0 text-[0.65rem] text-blue-400">Smart</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </nav>

      {/* The song playing, as a small cover on the rail (A281): the deck's title is far away at the bottom, and this
          opens Now Playing in one click. Lit while it plays. The open sidebar leaves it to the deck. */}
      {collapsed && current && (
        <div className="flex shrink-0 justify-center px-3 pt-2">
          <button
            type="button"
            onClick={openPlayer}
            aria-label={`Now playing: ${current.title}. Open the player.`}
            {...tipFor(`${isPlaying ? 'Playing' : 'Paused'}: ${current.title}`)}
            className={`rail-cover ${isPlaying ? 'is-playing' : ''}`}
          >
            <CoverArt kind="tracks" id={current.id} bare className="h-full w-full" />
          </button>
        </div>
      )}

      {collapsed && tip && (
        <span role="tooltip" className="side-tip" style={{ top: tip.top, left: tip.left }}>
          {tip.text}
        </span>
      )}
    </aside>
  );
}
