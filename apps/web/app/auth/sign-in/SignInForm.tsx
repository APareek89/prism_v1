'use client';

import { useState } from 'react';

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
      const response = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? 'Could not send the magic link.');
      setStatus('sent');
      setMessage('If this email is linked to Prism, its one-time sign-in link is on the way.');
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
