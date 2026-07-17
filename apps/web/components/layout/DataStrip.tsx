'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function DataStrip() {
  const pathname = usePathname() ?? '';
  return (
    <div className="demo-strip live-strip" role="status">
      <strong>Real data</strong>
      <span>{pathname.startsWith('/connect') ? 'GitHub and personal AI connections are live' : 'No demo people or synthetic scores · missing evidence stays unpublished'}</span>
      <Link href={pathname.startsWith('/connect') ? '/me' : '/connect'}>{pathname.startsWith('/connect') ? 'Open my workspace →' : 'Manage connections →'}</Link>
    </div>
  );
}
