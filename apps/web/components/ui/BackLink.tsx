// components/ui/BackLink.tsx
//
// "← Back to squad" style link. Used on the member-detail route.

import Link from 'next/link';
import type { ReactNode } from 'react';

export interface BackLinkProps {
  href: string;
  children: ReactNode;
}

export function BackLink({ href, children }: BackLinkProps) {
  return (
    <Link
      href={href}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12.5,
        color: 'var(--mut)',
        padding: '4px 0',
      }}
    >
      <span aria-hidden>←</span>
      {children}
    </Link>
  );
}
