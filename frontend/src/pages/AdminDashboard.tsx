import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

/**
 * The admin's dashboard (owner request, 2026-10-11): server health, uploads and accounts behind one header button,
 * as tabs rather than a sidebar (DESIGN.md rules out the SaaS dashboard shell). Each tab is its own route, so a link
 * or a reload lands on the same tab, and uploads keep going while switching (`UploadProvider`).
 */

const TABS = [
  { to: '/control-center', label: 'Overview', end: true },
  { to: '/control-center/upload', label: 'Upload', end: false },
  { to: '/control-center/users', label: 'Users', end: false },
  { to: '/control-center/levelling', label: 'Levelling', end: false },
];

export function AdminDashboard() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-white">Control Center</h1>
        <p className="mt-0.5 text-sm text-blue-300">Server health, uploads, accounts and volume levelling. Only admins see this.</p>
      </div>

      {/* Same tab look as the header's nav, so it reads as the same machine. */}
      <nav aria-label="Control Center sections" className="mb-6 flex gap-1 border-b border-blue-800">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-orange-600 text-white'
                  : 'border-transparent text-blue-300 hover:border-blue-500 hover:text-white'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      {/* Its own boundary, so the tabs stay put while a tab's code loads instead of the whole page blanking. */}
      <Suspense fallback={<p className="text-sm text-blue-300">Loading…</p>}>
        <Outlet />
      </Suspense>
    </div>
  );
}
