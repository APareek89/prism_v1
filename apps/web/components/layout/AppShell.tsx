// components/layout/AppShell.tsx
//
// The top-level frame: Sidebar + main content column. Server component (the Sidebar
// is the only client island). Responsive: the sidebar collapses its width on small
// viewports via CSS; main scrolls independently.

import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100dvh', background: 'var(--bg)' }}>
      <Sidebar />
      <main
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Every view runs on the deterministic v3 dataset — the banner lives here once. */}
        <div style={{ padding: '20px 30px 0', maxWidth: 1320 }}>
          <div className="note" style={{ marginBottom: 0 }}>
            <h4>◤ DEMO DATA — v3.0 model</h4>
            <p>
              All views run on a <b>deterministic synthetic dataset</b> (Postgres schema <b>v3</b>,
              10 archetypal developers). No real employee data — the public schema is untouched.
              Rebuild the identical world with <b>npm run v3:reset</b>.
            </p>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
