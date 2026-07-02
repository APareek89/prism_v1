// app/v3/layout.tsx
//
// v3 preview section. Renders inside the standard AppShell using the v1 design
// system — pages are structural mirrors of the v1 views (.main/.top/.daterow).
// This layout adds only the mandatory DEMO DATA banner (the approved `.note`
// treatment), aligned to the .main content metrics (30px gutter, 1320 max).

import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';

export default function V3Layout({ children }: { children: ReactNode }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ padding: '20px 30px 0', maxWidth: 1320 }}>
        <div className="note" style={{ marginBottom: 0 }}>
          <h4>◤ DEMO DATA — v3.0 model preview</h4>
          <p>
            Everything below runs on a <b>deterministic synthetic dataset</b> (Postgres schema{' '}
            <b>v3</b>, 10 archetypal developers). No real employee data; the v1 views and public
            schema are untouched. Rebuild the identical world with <b>npm run v3:reset</b>.
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}
