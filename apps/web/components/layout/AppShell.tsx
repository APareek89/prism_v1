'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { DataStrip } from './DataStrip';
import type { AppRole } from '@/lib/types';

export function AppShell({ children, roles, workspaceName }: { children: ReactNode; roles: AppRole[]; workspaceName: string | null }) {
  const pathname = usePathname() ?? '';
  if (pathname.startsWith('/auth/')) {
    return <div className="auth-shell">{children}</div>;
  }
  return (
    <div className="app-shell">
      <Sidebar roles={roles} workspaceName={workspaceName} />
      <div className="app-stage">
        <DataStrip roles={roles} />
        <main>{children}</main>
      </div>
    </div>
  );
}
