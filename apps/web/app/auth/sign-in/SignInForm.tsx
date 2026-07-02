// app/auth/sign-in/SignInForm.tsx
//
// Magic-link email form (+ a "Continue as demo user" button shown only in DEMO_MODE).
// Client component: it calls the anon browser client to send the magic link, and the
// demo button posts to the DEMO-only server action. Keyless-safe: nothing constructs
// the Supabase client until the user actually submits.

'use client';

import { useState } from 'react';
import { demoSignIn } from '@/lib/auth/demo-signin';
import { ROUTES } from '@/lib/config/constants';

export function SignInForm({ demoMode }: { demoMode: boolean }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setMessage(null);
    try {
      // Lazy import so the browser client is only constructed on submit.
      const { createClient } = await import('@/lib/supabase/browser');
      const supabase = createClient();
      const redirectTo = `${window.location.origin}${ROUTES.authCallback}`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      setStatus('sent');
      setMessage('Check your email for a sign-in link.');
    } catch (err) {
      setStatus('error');
      setMessage(
        err instanceof Error
          ? err.message
          : 'Could not send the magic link. Is Supabase configured?',
      );
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 360 }}>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label htmlFor="email" style={{ fontSize: 12.5, color: 'var(--mut)' }}>
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          style={{
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--line2)',
            background: 'var(--panel2)',
            color: 'var(--ink)',
            fontSize: 13.5,
            fontFamily: 'var(--body)',
          }}
        />
        <button
          type="submit"
          disabled={status === 'sending'}
          style={{
            cursor: status === 'sending' ? 'wait' : 'pointer',
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--line2)',
            background: 'var(--usage)',
            color: '#06122b',
            fontSize: 13.5,
            fontWeight: 700,
            fontFamily: 'var(--body)',
          }}
        >
          {status === 'sending' ? 'Sending…' : 'Send magic link'}
        </button>
      </form>

      {message ? (
        <p
          role="status"
          style={{
            fontSize: 12.5,
            color: status === 'error' ? 'var(--bad)' : 'var(--good)',
          }}
        >
          {message}
        </p>
      ) : null}

      {demoMode ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--mut2)' }}>
            <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            <span style={{ fontSize: 11 }}>or</span>
            <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          </div>
          <form action={demoSignIn}>
            <button
              type="submit"
              style={{
                width: '100%',
                cursor: 'pointer',
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--line2)',
                background: 'var(--panel2)',
                color: 'var(--ink)',
                fontSize: 13.5,
                fontWeight: 600,
                fontFamily: 'var(--body)',
              }}
            >
              Continue as demo user
            </button>
          </form>
        </>
      ) : null}
    </div>
  );
}
