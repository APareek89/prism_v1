'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ConfigurationSnapshot } from '@/lib/configuration/store';
import type { Dimension } from '@/lib/ui/view-models';

type Step = 'connection' | 'data' | 'index' | 'organization' | 'access';
const STEPS: Array<{ id: Step; label: string; hint: string }> = [
  { id: 'connection', label: 'Connection', hint: 'GitHub and personal AI setup' },
  { id: 'data', label: 'Data', hint: 'Processing approval' },
  { id: 'index', label: 'Index', hint: 'Availability and weights' },
  { id: 'organization', label: 'Organization', hint: 'Repositories and structure' },
  { id: 'access', label: 'Access', hint: 'Roles and permissions' },
];

function dateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Not confirmed';
}

export function ConfigurationClient({ initial, currentEmployeeId }: { initial: ConfigurationSnapshot; currentEmployeeId: string }) {
  const router = useRouter();
  const firstIncomplete = STEPS.find((step) => !initial.profile.completed[step.id])?.id ?? 'connection';
  const [step, setStep] = useState<Step>(firstIncomplete);
  const [providers, setProviders] = useState(initial.profile.allowedProviders);
  const [methods, setMethods] = useState(initial.profile.connectionMethods);
  const [measurementStartDate, setMeasurementStartDate] = useState(initial.profile.measurementStartDate);
  const [preferences, setPreferences] = useState(initial.preferences);
  const [weights, setWeights] = useState(initial.index.weights);
  const [repoIds, setRepoIds] = useState(initial.function.repoIds);
  const [people, setPeople] = useState(initial.employees.map((person) => ({ ...person })));
  const [roles, setRoles] = useState(Object.fromEntries(initial.employees.map((person) => [person.id, person.role])));
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);

  const completedCount = Object.values(initial.profile.completed).filter(Boolean).length;
  const weightTotal = Object.values(weights).reduce((sum, value) => sum + Number(value || 0), 0);
  const enabledKeys = useMemo(() => new Set(Object.entries(preferences).filter(([, enabled]) => enabled).map(([key]) => key)), [preferences]);

  function stepAvailable(candidate: Step): boolean {
    const index = STEPS.findIndex((item) => item.id === candidate);
    if (index === 0) return true;
    return Boolean(initial.profile.completed[STEPS[index - 1]!.id]);
  }

  async function save(payload: Record<string, unknown>) {
    setWorking(true); setNotice(null);
    try {
      const response = await fetch('/api/configuration', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? 'Could not save configuration');
      setNotice({ tone: 'good', text: `${String(payload.section)} configuration confirmed. The audit history has been updated.` });
      router.refresh();
      window.setTimeout(() => window.location.reload(), 650);
    } catch (error) {
      setNotice({ tone: 'bad', text: error instanceof Error ? error.message : 'Could not save configuration' });
    } finally { setWorking(false); }
  }

  function toggle(value: string, values: string[], setter: (next: string[]) => void) {
    setter(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  }

  function redistribute() {
    const dimensions: Dimension[] = ['usage', 'efficiency', 'effectiveness', 'proficiency'];
    const enabled = dimensions.filter((dimension) => !initial.index.disabledReasons[dimension]);
    if (!enabled.length) return;
    const base = Math.floor(100 / enabled.length);
    let remainder = 100 - base * enabled.length;
    setWeights(Object.fromEntries(dimensions.map((dimension) => [dimension, enabled.includes(dimension) ? base + (remainder-- > 0 ? 1 : 0) : 0])) as Record<Dimension, number>);
  }

  return (
    <div className="configuration-shell">
      <aside className="configuration-steps" aria-label="Configuration steps">
        <div className="readiness-ring"><strong>{completedCount}/5</strong><span>ready</span></div>
        {STEPS.map((item, index) => {
          const available = stepAvailable(item.id);
          const done = Boolean(initial.profile.completed[item.id]);
          return <button key={item.id} disabled={!available} className={`${step === item.id ? 'active' : ''} ${done ? 'done' : ''}`} onClick={() => setStep(item.id)}><i>{done ? '✓' : index + 1}</i><span><strong>{item.label}</strong><small>{available ? item.hint : 'Complete previous step'}</small></span></button>;
        })}
        <div className="config-trust"><strong>Change contract</strong><p>Settings affect future processing only. Historical scores keep their original config version.</p></div>
      </aside>

      <section className="configuration-stage">
        {notice ? <div className={`config-notice ${notice.tone}`} role="status">{notice.text}</div> : null}
        {step === 'connection' ? <ConnectionStep /> : null}
        {step === 'data' ? <DataStep /> : null}
        {step === 'index' ? <IndexStep /> : null}
        {step === 'organization' ? <OrganizationStep /> : null}
        {step === 'access' ? <AccessStep /> : null}
      </section>
    </div>
  );

  function StepHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
    return <header className="config-heading"><div><span className="page-kicker">{eyebrow}</span><h2>{title}</h2><p>{description}</p></div><span className={`config-confirmation ${initial.profile.completed[step] ? 'done' : ''}`}>{initial.profile.completed[step] ? `Confirmed ${dateTime(initial.profile.completed[step])}` : 'Confirmation required'}</span></header>;
  }

  function ConnectionStep() {
    return <><StepHeading eyebrow="Step 1 · Evidence foundation" title="Connect the organization, then offer personal setup" description="GitHub supplies team and delivery evidence. Each person separately opts into metadata-only Codex or Claude Code telemetry." />
      <div className="config-status-card"><div className={`source-orb ${initial.github.connected ? 'live' : ''}`}>GH</div><div><small>Organization connection</small><h3>{initial.github.org ?? 'GitHub App not connected'}</h3><p>{initial.github.appRepoIds.length} repositories granted · Last sync {dateTime(initial.github.lastSyncAt)}</p>{initial.github.lastError ? <em>{initial.github.lastError}</em> : null}</div><Link className="button" href="/connect">Manage live connection</Link></div>
      <div className="config-grid two">
        <fieldset className="config-fieldset"><legend>Personal tools offered</legend><p>These options appear in each user’s My View connection tab.</p>{([['codex','Codex'],['claude_code','Claude Code']] as const).map(([value,label]) => <label className="config-choice" key={value}><input type="checkbox" checked={providers.includes(value)} onChange={() => toggle(value, providers, setProviders)} /><span><strong>{label}</strong><small>Metadata-only OTEL plus verified PR linking</small></span></label>)}</fieldset>
        <fieldset className="config-fieldset"><legend>Setup delivery methods</legend><p>Allow one or both. Email still depends on a verified Resend sender.</p>{([['terminal','Terminal command'],['email','Email invitation']] as const).map(([value,label]) => <label className="config-choice" key={value}><input type="checkbox" checked={methods.includes(value)} onChange={() => toggle(value, methods, setMethods)} /><span><strong>{label}</strong><small>{value === 'terminal' ? 'User copies a time-limited command from My View' : 'Send sign-in and setup instructions to a verified work email'}</small></span></label>)}</fieldset>
      </div>
      <label className="config-date">Measurement start date<input type="date" value={measurementStartDate} onChange={(event) => setMeasurementStartDate(event.target.value)} /><small>Prism will not treat evidence before this date as part of the configured measurement period.</small></label>
      <div className="config-footer"><p>{initial.github.connected ? 'GitHub is live. Confirm the personal connection choices to unlock Data configuration.' : 'Connect and sync GitHub before this step can be confirmed.'}</p><button className="button primary" disabled={working || !initial.github.connected || !providers.length || !methods.length} onClick={() => save({ section: 'connection', allowedProviders: providers, connectionMethods: methods, measurementStartDate })}>{working ? 'Saving…' : 'Confirm connection setup'}</button></div>
    </>;
  }

  function DataStep() {
    const grouped = ['github','codex','claude_code','sentry'] as const;
    return <><StepHeading eyebrow="Step 2 · Data processing" title="Approve each evidence category" description="Every category states what it contains, why it matters, and which index dimensions depend on it. Prompt text, responses, source code, and tool payloads are never in this catalogue." />
      {grouped.map((source) => <section className="data-source-group" key={source}><div className="data-source-title"><strong>{source === 'claude_code' ? 'Claude Code' : source[0]!.toUpperCase() + source.slice(1)}</strong><span>{initial.sourceStatus[source].available ? '● ' : '○ '}{initial.sourceStatus[source].detail} · {initial.catalogue.filter((item) => item.source === source && preferences[item.key]).length}/{initial.catalogue.filter((item) => item.source === source).length} approved</span></div>{initial.catalogue.filter((item) => item.source === source).map((item) => <article className={`data-catalogue-row ${preferences[item.key] ? 'enabled' : ''}`} key={item.key}><label><input type="checkbox" checked={preferences[item.key] ?? false} disabled={item.required} onChange={() => setPreferences((current) => ({ ...current, [item.key]: !current[item.key] }))} /><span><strong>{item.label}{item.required ? ' · required' : ''}</strong><small>{item.fields}</small></span></label><p>{item.significance}</p><div><span>{item.dimensions.join(' · ')}</span><span>{item.sensitivity} sensitivity</span><span>{item.retention}</span></div></article>)}</section>)}
      <div className="config-footer"><p>Confirming records consent version 1 and an effective timestamp. You can return later; changes affect future processing.</p><button className="button primary" disabled={working} onClick={() => save({ section: 'data', preferences })}>{working ? 'Saving…' : 'Approve selected data'}</button></div>
    </>;
  }

  function IndexStep() {
    const dimensions: Dimension[] = ['usage','efficiency','effectiveness','proficiency'];
    return <><StepHeading eyebrow="Step 3 · Deterministic model" title="Validate availability and future weights" description="The formulas, anchors, confidence gates, and raw evidence remain owned by the deterministic scoring engine. A changed weight set creates a new config version." />
      <div className="index-readiness"><div><small>Current version</small><strong>v{initial.index.version}</strong></div><div><small>Real KPIs with signal</small><strong>{initial.index.availableKpis.length}</strong></div><div><small>Proposed total</small><strong className={weightTotal === 100 ? '' : 'bad'}>{weightTotal}%</strong></div><button className="button" onClick={redistribute}>Redistribute available weights</button></div>
      <div className="index-config-list">{dimensions.map((dimension) => { const reason = initial.index.disabledReasons[dimension]; return <article key={dimension} className={reason ? 'disabled' : ''}><div><span className="dimension-name">{dimension}</span><strong>{reason ? 'Unavailable with selected data' : 'Available'}</strong><p>{reason ?? 'Uses only approved evidence and the existing normalization anchors.'}</p></div><label>Weight<input type="number" min="0" max="100" step="1" value={weights[dimension]} onChange={(event) => setWeights((current) => ({ ...current, [dimension]: Number(event.target.value) }))} />%</label></article>; })}</div>
      <section className="kpi-contract"><div className="data-source-title"><strong>Complete KPI contract</strong><span>{initial.index.availableKpis.length}/{initial.index.kpis.length} have real signal · normalization is capped 0–100</span></div>{dimensions.map((dimension) => <details key={dimension} open={dimension === 'usage'}><summary><span>{dimension}</span><small>minimum {initial.index.minimumSignals[dimension]} signals · {weights[dimension]}% of L1</small></summary><div className="kpi-contract-rows">{initial.index.kpis.filter((kpi) => kpi.dimension === dimension).map((kpi) => <article key={kpi.id}><div><strong>{kpi.label}</strong><code>{kpi.id}</code></div><span>{kpi.intraWeight}% of {dimension}</span><span>{kpi.direction === 'lower' ? '↓ lower is better' : '↑ higher is better'}</span><span>{kpi.anchorLabel}</span><em className={kpi.hasSignal ? 'live' : ''}>{kpi.hasSignal ? 'real signal' : 'awaiting evidence'}</em></article>)}</div></details>)}</section>
      <details className="config-details"><summary>Calculation and publication contract</summary><div><p>L1 = the weighted sum of qualifying L2 dimensions divided by the enabled weight total. Each L2 is a weighted combination of normalized KPI scores from 0–100.</p><p>Confidence is derived from qualifying evidence weight. L0/L5 gates, minimum signal, frozen sizing, and all KPI anchors remain unchanged.</p><p>Historical `index_daily` rows retain their original `config_version`; no backfill is performed by confirmation.</p></div></details>
      <div className="config-footer"><p>{weightTotal === 100 ? 'This confirmation applies to future pipeline runs. No score is recomputed in the browser.' : `Adjust weights by ${100 - weightTotal} percentage points.`}</p><button className="button primary" disabled={working || weightTotal !== 100} onClick={() => save({ section: 'index', weights })}>{working ? 'Saving…' : `Confirm as ${JSON.stringify(weights) === JSON.stringify(initial.index.weights) ? `version ${initial.index.version}` : `new version ${initial.index.version + 1}`}`}</button></div>
    </>;
  }

  function OrganizationStep() {
    return <><StepHeading eyebrow="Step 4 · Measurement scope" title="Choose repositories and resolve the team" description="GitHub App access is the outer security boundary. Prism scope can only narrow that list. Missing emails remain visible instead of being guessed." />
      <div className="config-grid two"><section className="config-panel"><h3>Repositories</h3><p>App access versus active Prism measurement scope.</p>{initial.github.appRepoIds.map((repo) => <label className="repo-scope" key={repo}><input type="checkbox" checked={repoIds.includes(repo)} onChange={() => setRepoIds((current) => current.includes(repo) ? current.filter((item) => item !== repo) : [...current, repo])} /><span><strong>{repo}</strong><small>GitHub App: granted · Prism: {repoIds.includes(repo) ? 'in scope' : 'excluded'}</small></span></label>)}</section><section className="config-panel"><h3>Scope safeguard</h3><p>The GitHub installation remains authoritative. Removing a repository here stops future Prism processing but does not change the App installation itself.</p><div className="scope-summary"><strong>{repoIds.length}</strong><span>of {initial.github.appRepoIds.length} repositories measured</span></div></section></div>
      <section className="people-config"><div className="data-source-title"><strong>People and structure</strong><span>{people.filter((person) => person.email).length}/{people.length} emails resolved</span></div>{people.map((person, index) => <article key={person.id}><div><strong>{person.name}</strong><small>@{person.githubHandle ?? 'unresolved identity'}</small></div><label>Email<input type="email" value={person.email ?? ''} placeholder="Missing — add work email" onChange={(event) => setPeople((current) => current.map((item, i) => i === index ? { ...item, email: event.target.value || null } : item))} /></label><label>Role / title<input value={person.designation ?? ''} placeholder="e.g. Staff Engineer" onChange={(event) => setPeople((current) => current.map((item, i) => i === index ? { ...item, designation: event.target.value || null } : item))} /></label><label>Team<input value={person.teamName ?? ''} placeholder="e.g. Platform" onChange={(event) => setPeople((current) => current.map((item, i) => i === index ? { ...item, teamName: event.target.value || null } : item))} /></label></article>)}</section>
      <div className="config-footer"><p>Team names create real organization groups only when you confirm. Unresolved emails stay in the identity queue.</p><button className="button primary" disabled={working || !repoIds.length} onClick={() => save({ section: 'organization', repoIds, people: people.map((person) => ({ employeeId: person.id, email: person.email, designation: person.designation, teamName: person.teamName })) })}>{working ? 'Saving…' : 'Confirm organization scope'}</button></div>
    </>;
  }

  function AccessStep() {
    return <><StepHeading eyebrow="Step 5 · Least-privilege access" title="Assign what each person can see" description="Visibility is enforced on server routes and data reads. Hiding a navigation item is only the presentation layer." />
      <div className="rbac-matrix"><div><strong>Admin</strong><span>All views, Configuration, Admin evidence, roster and connectors</span></div><div><strong>Management</strong><span>Overview, People, Org Actions, My View and My Actions</span></div><div><strong>Manager</strong><span>Assigned team views and Org Actions, plus personal views</span></div><div><strong>Member</strong><span>My View and My Actions only</span></div></div>
      <section className="access-list">{people.map((person) => <article key={person.id}><div><strong>{person.name}{person.id === currentEmployeeId ? ' · you' : ''}</strong><small>{person.email ?? `@${person.githubHandle ?? 'email missing'}`}</small></div><select value={roles[person.id]} onChange={(event) => setRoles((current) => ({ ...current, [person.id]: event.target.value as 'admin' | 'management' | 'manager' | 'member' }))} disabled={person.id === currentEmployeeId}><option value="admin">Admin</option><option value="management">Management</option><option value="manager">Manager</option><option value="member">Member</option></select><span>{roles[person.id] === 'admin' ? 'Full system access' : roles[person.id] === 'management' ? 'Organization visibility' : roles[person.id] === 'manager' ? 'Team-scoped visibility' : 'Personal visibility'}</span></article>)}</section>
      <div className="config-footer"><p>Your own Admin role is locked during this confirmation to prevent accidental lockout.</p><button className="button primary" disabled={working} onClick={() => save({ section: 'access', roles: Object.entries(roles).map(([employeeId, role]) => ({ employeeId, role })) })}>{working ? 'Saving…' : 'Confirm access model'}</button></div>
      <details className="config-details audit"><summary>Configuration audit history · {initial.audit.length} events</summary>{initial.audit.length ? initial.audit.map((event) => <div className="audit-row" key={event.id}><span>{event.section}</span><strong>{event.action}</strong><small>{event.actorName ?? 'System'} · {dateTime(event.createdAt)}</small><details><summary>Inspect before / after evidence</summary><div className="audit-json"><section><b>Before</b><pre>{JSON.stringify(event.before, null, 2)}</pre></section><section><b>After</b><pre>{JSON.stringify(event.after, null, 2)}</pre></section></div></details></div>) : <p>No configuration changes recorded yet.</p>}</details>
    </>;
  }
}
