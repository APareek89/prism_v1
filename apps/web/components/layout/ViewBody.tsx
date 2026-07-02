// components/layout/ViewBody.tsx
//
// Consistent scrollable content region beneath a MetaStrip. Keeps padding/gap uniform
// across the four views and Admin.

import type { CSSProperties, ReactNode } from 'react';

export function ViewBody({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        flex: 1,
        padding: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
