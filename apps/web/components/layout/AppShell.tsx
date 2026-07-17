'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { DataStrip } from './DataStrip';

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  if (pathname.startsWith('/auth/')) {
    return <div className="auth-shell">{children}</div>;
  }
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
