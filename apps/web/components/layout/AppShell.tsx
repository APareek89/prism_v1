'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { TopNav } from './TopNav';
import { DataStrip } from './DataStrip';
import type { AppRole } from '@/lib/types';

export function AppShell({ children, roles }: { children: ReactNode; roles: AppRole[] }) {
  const pathname = usePathname() ?? '';
  if (pathname.startsWith('/auth/')) {
    return <div className="auth-shell">{children}</div>;
  }
  return (
    <div className="app-shell">
      <TopNav roles={roles} />
      <div className="app-stage">
        <DataStrip roles={roles} />
        <main>{children}</main>
      </div>
    </div>
  );
}
