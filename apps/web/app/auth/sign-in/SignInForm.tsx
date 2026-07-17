'use client';

import { useState } from 'react';
import { ROUTES } from '@/lib/config/constants';

export function SignInForm({
  initialEmail = '',
  initialError = null,
}: {
  initialEmail?: string;
  initialError?: string | null;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>(initialError ? 'error' : 'idle');
  const [message, setMessage] = useState<string | null>(initialError);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus('sending');
    setMessage(null);
    try {
      const { createClient } = await import('@/lib/supabase/browser');
      const supabase = createClient();
      const redirectTo = `${window.location.origin}${ROUTES.authCallback}`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
      });
      if (error) throw error;
      setStatus('sent');
      setMessage(`Magic link sent to ${email}. Open it in this browser to continue.`);
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Could not send the magic link.');
    }
  }

  return (
    <form className="auth-form" onSubmit={onSubmit}>
      <label htmlFor="workspace-email">Work email</label>
      <input
        id="workspace-email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@company.com"
      />
      <button type="submit" className="button primary" disabled={status === 'sending' || status === 'sent'}>
        {status === 'sending' ? 'Sending secure link…' : status === 'sent' ? 'Check your email' : 'Email me a sign-in link'}
      </button>
      {message ? <div className={`auth-message ${status === 'error' ? 'is-error' : 'is-success'}`} role="status">{message}</div> : null}
    </form>
  );
}
