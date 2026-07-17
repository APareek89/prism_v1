import Link from 'next/link';
import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-stage">
        <div className="demo-strip" role="status">
          <strong>Demo data</strong>
          <span>Deterministic v3 preview · 10 archetypal developers · no real employee data</span>
          <Link href="/configure">How the index works →</Link>
        </div>
        <main>{children}</main>
      </div>
    </div>
  );
}
