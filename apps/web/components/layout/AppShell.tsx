import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { DataStrip } from './DataStrip';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-stage">
        <DataStrip />
        <main>{children}</main>
      </div>
    </div>
  );
}
