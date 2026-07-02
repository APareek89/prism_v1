// app/error.tsx
//
// Root error boundary. Must be a Client Component (it receives a reset fn). Keeps the
// dark aesthetic and offers a retry. No stack traces leaked to the UI.

'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the console for local debugging; production would wire Sentry here.
    // eslint-disable-next-line no-console
    console.error('[prism] route error', error);
  }, [error]);

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: 48,
        textAlign: 'center',
      }}
    >
      <span
        aria-hidden
        style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--bad)' }}
      />
      <h1 className="display" style={{ fontSize: 20, fontWeight: 700 }}>
        Something refracted wrong
      </h1>
      <p style={{ color: 'var(--mut)', fontSize: 13.5, maxWidth: 360 }}>
        An unexpected error occurred while rendering this view.
        {error.digest ? (
          <>
            {' '}
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--mut2)' }}>({error.digest})</span>
          </>
        ) : null}
      </p>
      <button
        onClick={reset}
        style={{
          marginTop: 6,
          cursor: 'pointer',
          padding: '8px 16px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--line2)',
          background: 'var(--panel2)',
          color: 'var(--ink)',
          fontSize: 13,
          fontWeight: 600,
          fontFamily: 'var(--body)',
        }}
      >
        Try again
      </button>
    </div>
  );
}
