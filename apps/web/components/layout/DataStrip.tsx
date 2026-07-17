'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function DataStrip() {
  const pathname = usePathname() ?? '';
  if (pathname.startsWith('/connect')) {
    return (
      <div className="demo-strip live-strip" role="status">
        <strong>Live inputs</strong>
        <span>Connector data is real · scoring preview remains isolated until the ingestion contract is promoted</span>
        <Link href="/configure">View model boundary →</Link>
      </div>
    );
  }
  return (
    <div className="demo-strip" role="status">
      <strong>Demo data</strong>
      <span>Deterministic v3 preview · 10 archetypal developers · no real employee data</span>
      <Link href="/configure">How the index works →</Link>
    </div>
  );
}

