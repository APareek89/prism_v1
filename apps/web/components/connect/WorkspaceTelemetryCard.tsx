'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import type { PersonalTelemetryOverview } from '@/lib/connectors/telemetry/store';
import type { TelemetryProvider } from '@/lib/connectors/telemetry/types';

const PROVIDERS: Array<{
  id: TelemetryProvider;
  label: string;
  description: string;
}> = [
  {
    id: 'codex',
    label: 'Codex',
    description: 'Connect OpenAI Codex CLI telemetry from this computer.',
  },
  {
    id: 'claude_code',
    label: 'Claude Code',
    description: 'Connect Anthropic Claude Code telemetry from this computer.',
  },
];

function dateLabel(value: string | null): string {
  if (!value) return 'No signal yet';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Last signal received'
    : `Last signal ${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function WorkspaceTelemetryCard({
  signedIn,
  displayName,
  email,
  overview,
  allowedProviders = ['codex', 'claude_code'],
  connectionMethods = ['email', 'terminal'],
}: {
  signedIn: boolean;
  displayName: string;
  email: string | null;
  overview: PersonalTelemetryOverview | null;
  allowedProviders?: TelemetryProvider[];
  connectionMethods?: Array<'email' | 'terminal'>;
}) {
  const router = useRouter();
  const [provider, setProvider] = useState<TelemetryProvider>(allowedProviders[0] ?? 'codex');
  const [command, setCommand] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const state = provider === 'codex' ? overview?.codex : overview?.claudeCode;
  const providerLabel = provider === 'codex' ? 'Codex' : 'Claude Code';

  async function createCommand() {
    setWorking(true);
    setCopied(false);
    setNotice(null);
    try {
      const response = await fetch('/api/connect/telemetry/self', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? 'Could not create command');
      setCommand(body.command);
      setExpiresAt(body.expiresAt);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not create command');
    } finally {
      setWorking(false);
    }
  }

  async function copyCommand() {
    if (!command) return;
    await navigator.clipboard.writeText(command);
    setCopied(true);
  }

  async function revoke() {
    setWorking(true);
    setNotice(null);
    try {
      const response = await fetch('/api/connect/telemetry/self', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? 'Could not disconnect');
      setCommand(null);
      setNotice(`${providerLabel} is disconnected. Its previous collector token no longer works.`);
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not disconnect');
    } finally {
      setWorking(false);
    }
  }

  async function signOut() {
    const { createClient } = await import('@/lib/supabase/browser');
    await createClient().auth.signOut();
    window.location.assign('/auth/sign-in');
  }

  if (!signedIn) {
    return (
      <section className="workspace-connect workspace-connect-locked">
        <div className="workspace-connect-icon"><Icon name="terminal" size={23} /></div>
        <div>
          <span className="page-kicker">Personal setup</span>
          <h2>Sign in to get your one-time command</h2>
          <p>Prism binds the command to your GitHub-discovered identity. It cannot be generated from a shared or demo session.</p>
        </div>
        <Link className="button primary" href="/auth/sign-in">Sign in with Supabase</Link>
      </section>
    );
  }

  return (
    <section className="workspace-connect" aria-labelledby="workspace-connect-title">
      <div className="workspace-connect-head">
        <div>
          <span className="page-kicker">Personal data connection</span>
          <h2 id="workspace-connect-title">Connect your coding agent</h2>
          <p>Choose your tool, generate the private command, then paste it into the terminal on the computer where you use that tool.</p>
        </div>
        <div className="workspace-identity">
          <span className="avatar">{displayName.slice(0, 2).toUpperCase()}</span>
          <span><strong>{displayName}</strong><small>{email ?? overview?.email ?? 'Signed in'}</small></span>
          <button type="button" className="text-link" onClick={signOut}>Sign out</button>
        </div>
      </div>

      {!overview?.schemaReady ? (
        <div className="connect-warning"><Icon name="info" size={18} /><div><strong>Telemetry is not ready.</strong><p>Ask your administrator to finish the Prism connection migration.</p></div></div>
      ) : null}

      <div className="workspace-provider-tabs" role="tablist" aria-label="Coding agent">
        {PROVIDERS.filter((item) => allowedProviders.includes(item.id)).map((item) => {
          const itemState = item.id === 'codex' ? overview?.codex : overview?.claudeCode;
          const live = itemState?.status === 'connected';
          return (
            <button
              type="button"
              role="tab"
              aria-selected={provider === item.id}
              className={provider === item.id ? 'is-active' : ''}
              key={item.id}
              onClick={() => {
                setProvider(item.id);
                setCommand(null);
                setExpiresAt(null);
                setCopied(false);
                setNotice(null);
              }}
            >
              <span className="provider-monogram">{item.id === 'codex' ? 'CX' : 'CC'}</span>
              <span><strong>{item.label}</strong><small>{live ? `${itemState?.sessionCount ?? 0} sessions received` : item.description}</small></span>
              <i className={live ? 'is-live' : ''} aria-label={live ? 'Connected' : 'Not connected'} />
            </button>
          );
        })}
      </div>

      <div className="workspace-command-flow">
        <div className="workspace-command-copy">
          <span className={`connection-state ${state?.status === 'connected' ? 'connected' : state?.status === 'pending' ? 'pending' : ''}`}>
            <i />{state?.status === 'connected' ? `Connected · ${dateLabel(state.lastSeenAt ?? null)}` : state?.status === 'pending' ? 'Setup started · waiting for first signal' : 'Not connected'}
          </span>
          <h3>{command ? `Run this ${providerLabel} command` : `Create your ${providerLabel} command`}</h3>
          <p>{command ? 'Copy the entire line and run it in Terminal. Prism will back up your existing config and keep prompt/content logging disabled.' : 'Commands expire after 15 minutes and are shown only once because Prism stores only a hash of the invitation.'}</p>
        </div>

        {connectionMethods.includes('terminal') && command ? (
          <div className="workspace-terminal">
            <div className="terminal-chrome"><span /><span /><span /><small>Terminal</small></div>
            <pre><code>{command}</code></pre>
            <div className="workspace-terminal-actions">
              <button type="button" className="button primary" onClick={copyCommand}><Icon name="copy" size={15} />{copied ? 'Copied' : 'Copy command'}</button>
              <button type="button" className="button" onClick={() => router.refresh()}>I ran it · check status</button>
              {expiresAt ? <small>Expires {dateLabel(expiresAt).replace('Last signal ', '')}</small> : null}
            </div>
          </div>
        ) : connectionMethods.includes('terminal') ? (
          <button type="button" className="button primary workspace-generate" disabled={working || !overview?.schemaReady} onClick={createCommand}>
            <Icon name="terminal" size={16} />{working ? 'Creating…' : `Generate my ${providerLabel} command`}
          </button>
        ) : <div className="workspace-email-only"><Icon name="info" size={18} /><div><strong>Email-only setup is enabled</strong><p>Check the invitation sent to {email ?? overview?.email ?? 'your work email'}, or ask your administrator to resend it from Configuration.</p></div></div>}
      </div>

      {connectionMethods.includes('email') ? <div className="workspace-method-note"><strong>Email setup available</strong><span>Your administrator can send or resend your secure workspace invitation. {connectionMethods.includes('terminal') ? 'You may also use the terminal command above.' : ''}</span></div> : null}

      {notice ? <div className="connect-notice" role="status">{notice}</div> : null}

      <div className="workspace-privacy-row">
        <span><Icon name="shield" size={16} /><b>Metadata only</b> — no prompts, responses, code, commands, or tool payloads.</span>
        {state?.status === 'connected' ? <button type="button" className="text-link danger-link" disabled={working} onClick={revoke}>Disconnect {providerLabel}</button> : null}
      </div>
    </section>
  );
}
