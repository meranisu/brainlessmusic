/**
 * The browser tab's title (A281): the playing song while one plays, else the page's name. Pages set a detail title (an
 * album's name) over the shell's section title; a module store, since child effects run before the shell's.
 */

const APP = 'brainlessmusic';

let section: string | null = null;
let detail: string | null = null;
let playing: string | null = null;

function apply() {
  const page = detail ?? section;
  document.title = playing ?? (page ? `${page} · ${APP}` : APP);
}

export function setSectionTitle(title: string | null): void {
  section = title;
  apply();
}

export function setDetailTitle(title: string | null): void {
  detail = title;
  apply();
}

export function setPlayingTitle(title: string | null): void {
  playing = title;
  apply();
}
