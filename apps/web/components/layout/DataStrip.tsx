'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AppRole } from '@/lib/types';

export function DataStrip({ roles }: { roles: AppRole[] }) {
  const pathname = usePathname() ?? '';
  const admin = roles.includes('admin');
  const connectionHref = admin ? '/configure' : '/me?tab=connection';
  return (
    <div className="demo-strip live-strip" role="status">
      <strong>Real data</strong>
      <span>{pathname.startsWith('/connect') ? 'GitHub and personal AI connections are live' : 'No demo people or synthetic scores · missing evidence stays unpublished'}</span>
      <Link href={pathname.startsWith('/connect') ? '/me' : connectionHref}>{pathname.startsWith('/connect') ? 'Open My View →' : admin ? 'Open configuration →' : 'Connect my tools →'}</Link>
    </div>
  );
}
