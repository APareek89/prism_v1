'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import type { ConnectOverview } from '@/lib/connectors/telemetry/store';
import type { TelemetryProvider } from '@/lib/connectors/telemetry/types';

interface Installation {
  id: number;
  account: string | null;
}

interface SetupCommand {
  command: string;
  expiresAt: string;
  provider: TelemetryProvider;
  employeeName: string;
}

const providerLabel: Record<TelemetryProvider, string> = {
  codex: 'Codex',
  claude_code: 'Claude Code',
};

function dateLabel(value: string | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Unknown'
    : `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function ConnectionState({ status, lastSeen }: { status: string | null; lastSeen: string | null }) {
  const connected = status === 'connected';
  const pending = status === 'pending';
  return (
    <span className={`connection-state ${connected ? 'connected' : pending ? 'pending' : ''}`}>
      <i />
      {connected ? `Live · ${dateLabel(lastSeen)}` : pending ? 'Setup started' : 'Not connected'}
    </span>
  );
}

export function ConnectClient({
  overview,
  installations,
  currentEmployeeId,
  githubConfigured,
}: {
  overview: ConnectOverview;
  installations: Installation[];
  currentEmployeeId: string;
  githubConfigured: boolean;
}) {
  const router = useRouter();
  const [working, setWorking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [setup, setSetup] = useState<SetupCommand | null>(null);
  const [copied, setCopied] = useState(false);
  const [emails, setEmails] = useState<Record<string, string>>(() =>
    Object.fromEntries(overview.employees.map((employee) => [employee.id, employee.email ?? ''])),
  );
  const currentEmployee = useMemo(
    () => overview.employees.find((employee) => employee.id === currentEmployeeId) ?? null,
    [overview.employees, currentEmployeeId],
  );

  async function activateGithub(installation: Installation) {
    setWorking(`github-${installation.id}`);
    setNotice(`Syncing repositories and team members from ${installation.account ?? 'this installation'}…`);
    try {
      const response = await fetch('/api/connectors/github/install', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ installationId: installation.id }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? 'GitHub sync failed');
      setNotice(`GitHub connected: ${body.repos?.length ?? 0} repos, ${body.prsUpserted ?? 0} PRs, ${body.commitsUpserted ?? 0} commits synced.`);
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'GitHub sync failed');
    } finally {
      setWorking(null);
    }
  }

  async function createSetup(employeeId: string, employeeName: string, provider: TelemetryProvider) {
    setWorking(`${employeeId}-${provider}`);
    setNotice(null);
    setCopied(false);
    try {
      const response = await fetch('/api/connect/telemetry/invites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ employeeId, provider }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? 'Could not create setup command');
      setSetup({ command: body.command, expiresAt: body.expiresAt, provider, employeeName });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not create setup command');
    } finally {
      setWorking(null);
    }
  }

  async function revoke(employeeId: string, provider: TelemetryProvider) {
    setWorking(`revoke-${employeeId}-${provider}`);
    try {
      const response = await fetch('/api/connect/telemetry/connections', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ employeeId, provider }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? 'Could not disconnect');
      setNotice(`${providerLabel[provider]} connection revoked. Its collector token no longer works.`);
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not disconnect');
    } finally {
      setWorking(null);
    }
  }

  async function sendWorkspaceInvite(employeeId: string, employeeName: string) {
    const email = emails[employeeId]?.trim() ?? '';
    if (!email) {
      setNotice(`Add ${employeeName}'s work email before sending an invitation.`);
      return;
    }
    setWorking(`email-${employeeId}`);
    setNotice(null);
    try {
      const response = await fetch('/api/connect/telemetry/email-invites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ employeeId, email }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? 'Could not send invitation');
      setNotice(body.detail ?? `Workspace invitation sent to ${email}.`);
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not send workspace invitation');
    } finally {
      setWorking(null);
    }
  }

  async function copyCommand() {
    if (!setup) return;
    await navigator.clipboard.writeText(setup.command);
    setCopied(true);
  }

  if (!overview.schemaReady) {
    return (
      <section className="connect-warning">
        <Icon name="info" size={20} />
        <div><strong>Connection schema is not migrated yet.</strong><p>Run the pending database migration, then refresh this page.</p></div>
      </section>
    );
  }

  return (
    <>
      {notice ? <div className="connect-notice" role="status">{notice}</div> : null}

      <section className="connect-step">
        <div className="step-number">1</div>
        <div className="step-content">
          <div className="step-heading">
            <div><span>Organization connection</span><h2>Bring in GitHub delivery evidence</h2><p>Prism uses only repositories selected in the GitHub App installation. Members or collaborators become the initial team.</p></div>
            <ConnectionState status={overview.github.status} lastSeen={overview.github.lastSyncAt} />
          </div>

          <div className="github-connect-grid">
            <div className="source-card source-card-dark">
              <div className="source-icon">GH</div>
              <div><small>Current source</small><h3>{overview.github.org ?? 'GitHub App'}</h3><p>{overview.github.repos.length} selected repos · {overview.github.prCount} PRs · {overview.github.commitCount} commits</p></div>
              <a className="button ghost" href="https://github.com/apps/prismai1989" target="_blank" rel="noreferrer">View app</a>
            </div>
            <div className="installation-list">
              <div className="installation-title"><strong>Available installations</strong><span>{githubConfigured ? `${installations.length} found` : 'Credentials missing'}</span></div>
              {installations.length ? installations.map((installation) => {
                const selected = installation.id === overview.github.installationId;
                return (
                  <div className="installation-row" key={installation.id}>
                    <span className="avatar">{(installation.account ?? 'GH').slice(0, 2).toUpperCase()}</span>
                    <span><strong>{installation.account ?? 'GitHub account'}</strong><small>{selected ? 'Current installation' : 'Ready to connect'}</small></span>
                    <button className={`button ${selected ? '' : 'primary'}`} disabled={working !== null} onClick={() => activateGithub(installation)}>
                      {working === `github-${installation.id}` ? 'Syncing…' : selected ? 'Sync again' : 'Use installation'}
                    </button>
                  </div>
                );
              }) : <p className="connect-empty">Install the GitHub App first, then return here.</p>}
              <a className="text-link" href="/api/connectors/github/install">Install on another account →</a>
            </div>
          </div>
        </div>
      </section>

      <section className="connect-step">
        <div className="step-number">2</div>
        <div className="step-content">
          <div className="step-heading">
            <div><span>Identity and invitations</span><h2>Give every real user a way into their workspace</h2><p>Send a Supabase login invitation by email, or create the personal setup command directly. Both paths resolve to the same GitHub-discovered employee.</p></div>
            <span className="count-badge">{overview.employees.length} people</span>
          </div>
          <div className="team-connect-list">
            {overview.employees.map((employee) => (
              <article className={`team-connect-row ${employee.id === currentEmployee?.id ? 'is-you' : ''}`} key={employee.id}>
                <div className="member-identity">
                  <span className="avatar">{employee.name.slice(0, 2).toUpperCase()}</span>
                  <span><strong>{employee.name}{employee.id === currentEmployee?.id ? ' · you' : ''}</strong><small>@{employee.githubHandle ?? 'unmatched'}</small></span>
                </div>
                <div className="workspace-invite">
                  <label htmlFor={`email-${employee.id}`}>Workspace email</label>
                  <div>
                    <input
                      id={`email-${employee.id}`}
                      className="text-input"
                      type="email"
                      value={emails[employee.id] ?? ''}
                      placeholder="name@company.com"
                      onChange={(event) => setEmails((current) => ({ ...current, [employee.id]: event.target.value }))}
                    />
                    <button className="button" disabled={working !== null} onClick={() => sendWorkspaceInvite(employee.id, employee.name)}>
                      {working === `email-${employee.id}` ? 'Sending…' : 'Email login'}
                    </button>
                  </div>
                  <small>Sent by Supabase Auth. The command appears after sign-in.</small>
                </div>
                <div className="tool-connection">
                  <span><b>Codex</b><ConnectionState status={employee.codexStatus} lastSeen={employee.codexLastSeenAt} /></span>
                  <div className="connection-actions">
                    <button className="button" disabled={working !== null} onClick={() => createSetup(employee.id, employee.name, 'codex')}>{working === `${employee.id}-codex` ? 'Creating…' : employee.codexStatus === 'connected' ? 'Reconnect' : 'Connect'}</button>
                    {employee.codexStatus === 'connected' ? <button className="icon-button" aria-label={`Disconnect Codex for ${employee.name}`} onClick={() => revoke(employee.id, 'codex')}>×</button> : null}
                  </div>
                </div>
                <div className="tool-connection">
                  <span><b>Claude Code</b><ConnectionState status={employee.claudeStatus} lastSeen={employee.claudeLastSeenAt} /></span>
                  <div className="connection-actions">
                    <button className="button" disabled={working !== null} onClick={() => createSetup(employee.id, employee.name, 'claude_code')}>{working === `${employee.id}-claude_code` ? 'Creating…' : employee.claudeStatus === 'connected' ? 'Reconnect' : 'Connect'}</button>
                    {employee.claudeStatus === 'connected' ? <button className="icon-button" aria-label={`Disconnect Claude Code for ${employee.name}`} onClick={() => revoke(employee.id, 'claude_code')}>×</button> : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="connect-step">
        <div className="step-number">3</div>
        <div className="step-content">
          <div className="step-heading">
            <div><span>Data readiness</span><h2>Know exactly what is flowing</h2><p>The collector captures session identity, model, turn counts, token counts, prompt length, and tool success metadata. Missing repo/PR linkage remains insufficient—not false.</p></div>
          </div>
          <div className="readiness-grid">
            <div><span>GitHub evidence</span><strong>{overview.github.prCount + overview.github.commitCount}</strong><small>PR + commit rows</small></div>
            <div><span>Claude sessions</span><strong>{overview.sessionCounts.claudeCode}</strong><small>From personal OTEL</small></div>
            <div><span>Exact AI → PR link</span><strong>Pending</strong><small>Needs Prism Bridge metadata</small></div>
          </div>
          <div className="privacy-contract">
            <Icon name="shield" size={21} />
            <div><strong>Metadata-only boundary</strong><p>Prism discards prompt and response bodies, source code, command strings, tool inputs/outputs, and unknown OTEL attributes before persistence.</p></div>
          </div>
        </div>
      </section>

      {setup ? (
        <div className="setup-overlay" role="dialog" aria-modal="true" aria-labelledby="setup-title">
          <div className="setup-dialog">
            <button className="setup-close" aria-label="Close setup" onClick={() => setSetup(null)}>×</button>
            <span className="page-kicker">Personal one-time setup</span>
            <h2 id="setup-title">Connect {setup.employeeName} to {providerLabel[setup.provider]}</h2>
            <p>Run this once in the same local or remote environment where {providerLabel[setup.provider]} executes. It backs up the existing user config, keeps prompt logging off, and sends a test signal. Managed enterprise settings may require an administrator rollout.</p>
            <pre><code>{setup.command}</code></pre>
            <div className="setup-actions">
              <button className="button primary" onClick={copyCommand}>{copied ? 'Copied' : 'Copy command'}</button>
              <button className="button" onClick={() => { router.refresh(); setSetup(null); }}>I ran it · check status</button>
            </div>
            <small>Expires {dateLabel(setup.expiresAt)}. The invitation can only be used once.</small>
          </div>
        </div>
      ) : null}
    </>
  );
}
