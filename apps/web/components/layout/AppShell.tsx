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
        {children}
      </main>
    </div>
  );
}
