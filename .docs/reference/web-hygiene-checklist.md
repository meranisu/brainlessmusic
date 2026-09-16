# Web hygiene, not SEO

A generic "SEO checklist" (sitemap, robots.txt, canonical tags, backlink strategy,
Search Console, noindex removal, etc.) surfaces periodically as advice for "why
isn't Google showing your site." None of it applies here: brainlessmusic is a
private, login-gated app for the owner and a couple of friends. It should
**not** be indexed by search engines — there's no public content, and being
findable would expose a friend group's music library rather than gain anything.
There is no `robots.txt` or `sitemap.xml`, and that's intentional, not an
oversight.

The subset of that checklist actually worth doing here has nothing to do with
ranking:

## Done (2026-09-16)

- **Route-level code splitting** — `frontend/src/App.tsx` lazy-loads every page
  component via `React.lazy`, wrapped in a single `<Suspense>`. Previously the
  production build shipped one ~446 KB JS chunk regardless of route; the
  pre-auth `/enter` screens and the four admin-only pages (`/manage`,
  `/upload`, `/users`, `/health`) are the biggest win since most sessions never
  touch them. Matters for the README's own bike-trip/on-the-road mobile use
  case.
- **Link-preview / head hygiene** — `frontend/index.html` gained a meta
  description, `theme-color` (matching the favicon's navy and the default
  theme), `apple-touch-icon`, and Open Graph tags (`og:title`, `og:description`,
  `og:image`). `og-image.png` and `apple-touch-icon.png` are rasterized from
  the existing `favicon.svg` (via ImageMagick `convert`) rather than new art.
- **Accessibility audit of `CoverArt` usage** — checked every call site; all of
  them already do the right thing (`AlbumGrid`/`AlbumDetailPage` pass a
  descriptive `alt`, every other call site uses `alt=""` next to visible title
  text, which is the correct pattern, not a gap). No changes needed.
- **Mobile responsiveness** — spot-checked the files with in-flight changes at
  the time; none added new non-responsive markup.

## Deliberately skipped

Sitemap, robots.txt, canonical URLs, backlink building, Search Console
verification, schema markup — all assume the goal is search visibility. If
that assumption ever changes (e.g. a genuinely public marketing page gets
added alongside the private app), revisit this list then; don't apply it to
the login-gated app itself.
