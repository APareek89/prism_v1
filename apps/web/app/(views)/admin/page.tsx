import { PageHeader, MetaChip } from '@/components/layout/PageHeader';
import { AdminRunControl } from '@/components/admin/AdminRunControl';
import { getAuthUser } from '@/lib/auth/session';
import { isAdmin } from '@/lib/auth/roles';
import { getLiveCalculationTrace, type TraceDimension } from '@/lib/admin/calculation-trace';
import { DIMENSION_HUES, DIMENSION_LABELS } from '@/app/tokens';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function scalar(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function validDate(value: string | undefined): string {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : today();
}

function fmt(value: number | null, suffix = ''): string {
  if (value === null) return 'No signal';
  return `${Number.isInteger(value) ? value : value.toFixed(2)}${suffix}`;
}

function pct(value: number | null): string {
  return value === null ? 'No signal' : `${(value * 100).toFixed(1)}%`;
}

function timestamp(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
}

function safeJson(value: Record<string, unknown>): string {
  const text = JSON.stringify(value);
  return text.length > 240 ? `${text.slice(0, 237)}…` : text;
}

function DimensionTrace({ dimension }: { dimension: TraceDimension }) {
  return (
    <article className="admin-dimension" style={{ '--dimension-hue': DIMENSION_HUES[dimension.id] } as React.CSSProperties}>
      <header>
        <div>
          <span className="admin-dimension-dot" />
          <strong>{DIMENSION_LABELS[dimension.id]}</strong>
          <small>{dimension.signals}/{dimension.minSignals} minimum signals</small>
        </div>
        <div className="admin-dimension-score">
          <b>{fmt(dimension.score)}</b>
          <span>{dimension.metMinSignal ? 'confidence qualified' : 'below confidence gate'}</span>
        </div>
      </header>
      <div className="admin-weight-flow">
        <span>Configured L1 weight <b>{dimension.configuredWeightPct}%</b></span>
        <span>Effective vote <b>{dimension.effectiveVotePct}%</b></span>
        <span>L1 contribution <b>{fmt(dimension.contributionToL1)}</b></span>
      </div>
      <div className="admin-kpi-list">
        {dimension.kpis.length === 0 ? <p className="admin-empty-inline">No scoreable KPI rows yet.</p> : dimension.kpis.map((kpi) => (
          <details className="admin-kpi" key={kpi.id} open={kpi.signals > 0}>
            <summary>
              <span><strong>{kpi.label}</strong><small>{kpi.formula}</small></span>
              <span className="admin-kpi-values">
                <i>raw {fmt(kpi.raw)}</i>
                <b>{fmt(kpi.normalized)}</b>
              </span>
            </summary>
            <div className="admin-kpi-detail">
              <div><span>Signals</span><b>{kpi.signals}</b></div>
              <div><span>Direction</span><b>{kpi.inverted ? 'Lower is better' : 'Higher is better'}</b></div>
              <div><span>Anchor</span><b>{kpi.inverted ? `100 at ≤ ${kpi.anchor.target}; 0 at ≥ ${kpi.anchor.ceil}` : `0 at ≤ ${kpi.anchor.floor}; 100 at ≥ ${kpi.anchor.target}`}</b></div>
              <div><span>Configured KPI weight</span><b>{kpi.configuredWeightPct}%</b></div>
              <div><span>Effective KPI vote</span><b>{kpi.effectiveVotePct}%</b></div>
              <div><span>L2 contribution</span><b>{fmt(kpi.contribution)}</b></div>
              <code>{kpi.source}</code>
            </div>
          </details>
        ))}
      </div>
    </article>
  );
}

export default async function AdminPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getAuthUser();
  if (!user || !isAdmin(user)) {
    return (
      <div className="page">
        <PageHeader kicker="Temporary admin lab" title="Administrator access required" description="This trace exposes raw evidence and internal calculation details, so it is restricted to workspace administrators." />
      </div>
    );
  }

  const params = await searchParams;
  const date = validDate(scalar(params.date));
  const employeeId = scalar(params.employee) ?? user.employeeId;
  const trace = await getLiveCalculationTrace({ functionId: user.functionId, employeeId, date });

  if (!trace) {
    return (
      <div className="page">
        <PageHeader kicker="Temporary admin lab" title="No real employee to trace yet" description="Connect GitHub and discover at least one active employee before running the calculation explorer." />
      </div>
    );
  }

  const confidencePct = Math.round(trace.member.confidenceScore * 100);

  return (
    <div className="page admin-trace-page">
      <PageHeader
        kicker="Temporary admin lab · live production rows"
        title={`How ${trace.person.name}'s score is built`}
        description="Follow a real commit from GitHub evidence through normalization, weighted dimensions, confidence gates, the final index, and grounded agent outputs. This page replays the production engine read-only."
        actions={<AdminRunControl date={date} />}
        meta={
          <>
            <MetaChip label="Run date" value={trace.date} tone="accent" />
            <MetaChip label="Window" value={`${trace.windowStart} → ${trace.windowEnd}`} />
            <MetaChip label="Config" value={trace.member.configVersion} />
            <MetaChip label="Data" value="Real only" />
          </>
        }
      />

      <form className="admin-trace-filter card" method="get">
        <label>Person<select name="employee" defaultValue={trace.person.id}>{trace.people.map((person) => <option value={person.id} key={person.id}>{person.name}{person.githubHandle ? ` · @${person.githubHandle}` : ''}</option>)}</select></label>
        <label>Calculation date<input type="date" name="date" defaultValue={trace.date} /></label>
        <button className="button" type="submit">Load trace</button>
        <span>Replayed {timestamp(trace.generatedAt)}</span>
      </form>

      <section className="admin-score-hero">
        <div className="admin-score-orb">
          <small>Employee L1</small>
          <strong>{fmt(trace.member.l1)}</strong>
          <span>{trace.member.band}</span>
        </div>
        <div className="admin-score-explain card">
          <div><span>Confidence</span><b>{confidencePct}% · {trace.member.confidenceBand}</b><p>{trace.member.suppressesL1 ? 'Below 40%: Prism suppresses L1 instead of publishing a shaky number.' : 'At least 40%: L1 can publish.'}</p></div>
          <div><span>Cohort gate</span><b>{trace.member.cohortSize} active people</b><p>{trace.member.cohortPenaltyApplied ? 'N < 8, so the confidence label drops one band; the numeric score is unchanged.' : 'No small-cohort penalty.'}</p></div>
          <div><span>L0 gate</span><b>{pct(trace.member.aiActiveShare)} AI-active PR share</b><p>Below 15% forces L0 even when the numeric index is higher.</p></div>
          <div><span>L5 gate</span><b>{trace.member.multiplierSignal} multiplier signals</b><p>L5 requires an authored skill reused by another engineer.</p></div>
        </div>
      </section>

      <section className="admin-flow card">
        <div className="cardhead"><div><span className="page-kicker">Event → score</span><h3>What happens when you commit</h3></div><span className="sub">a commit alone does not directly add points</span></div>
        <div className="admin-flow-steps">
          <div><b>1</b><strong>Commit captured</strong><p>Repository, author, timestamp, PR association, and AI co-author trailer.</p></div>
          <i>→</i>
          <div><b>2</b><strong>PR evidence assembled</strong><p>Merge status, size, revert/rework, AI link, and retained lines.</p></div>
          <i>→</i>
          <div><b>3</b><strong>KPIs normalized</strong><p>Raw ratios map to 0–100 using frozen anchors; good is capped at 100.</p></div>
          <i>→</i>
          <div><b>4</b><strong>L2 → L1</strong><p>Available KPI votes become dimensions; available dimensions become L1.</p></div>
          <i>→</i>
          <div><b>5</b><strong>Agents narrate</strong><p>They cite persisted evidence but never compute or change the score.</p></div>
        </div>
      </section>

      <section className="admin-section">
        <div className="cardhead"><div><span className="page-kicker">Deterministic calculation</span><h3>Every vote in the index</h3></div><span className="sub">null dimensions are removed, then remaining weights renormalize</span></div>
        <div className="admin-dimension-grid">{trace.member.dimensions.map((dimension) => <DimensionTrace dimension={dimension} key={dimension.id} />)}</div>
      </section>

      <section className="admin-evidence-grid">
        <div className="card admin-evidence-card">
          <div className="cardhead"><div><span className="page-kicker">GitHub evidence</span><h3>{trace.counts.commits} commits</h3></div><span className="sub">latest first</span></div>
          {trace.commits.length === 0 ? <p className="admin-empty-inline">No commits in the measurement window.</p> : <div className="admin-event-list">{trace.commits.slice(0, 30).map((commit) => <article key={`${commit.repo}:${commit.sha}`}><code>{commit.sha.slice(0, 7)}</code><div><strong>{commit.repo}{commit.prNumber ? ` · PR #${commit.prNumber}` : ''}</strong><p>{commit.effect}</p><small>{timestamp(commit.timestamp)} · {commit.aiAssisted ? 'AI trailer detected' : 'no AI trailer'}</small></div></article>)}</div>}
        </div>
        <div className="card admin-evidence-card">
          <div className="cardhead"><div><span className="page-kicker">Delivery evidence</span><h3>{trace.counts.prs} pull requests</h3></div><span className="sub">28-day window</span></div>
          {trace.prs.length === 0 ? <p className="admin-empty-inline">No pull requests in the measurement window.</p> : <div className="admin-event-list">{trace.prs.map((pr) => <article key={pr.id}><b>#{pr.number}</b><div><strong>{pr.title}</strong><p>{pr.merged ? 'Merged' : 'Not merged'} · size {pr.sizeBucket ?? 'pending'} ({pr.files} files, {pr.hunks} hunks) · {pr.aiAssisted ? 'AI-linked' : 'not AI-linked'}</p><small>{pr.repo} · {timestamp(pr.mergedAt ?? pr.createdAt)}</small></div></article>)}</div>}
        </div>
        <div className="card admin-evidence-card">
          <div className="cardhead"><div><span className="page-kicker">Coding-agent evidence</span><h3>{trace.counts.sessions} sessions</h3></div><span className="sub">metadata only</span></div>
          {trace.sessions.length === 0 ? <p className="admin-empty-inline">No Codex or Claude Code sessions in the measurement window.</p> : <div className="admin-event-list">{trace.sessions.slice(0, 30).map((session) => <article key={`${session.provider}:${session.sessionId}`}><b>{session.provider === 'codex' ? 'CX' : 'CC'}</b><div><strong>{session.turns} turns · {session.tokensIn + session.tokensOut} tokens</strong><p>{session.linkedPr ? 'Linked to a PR' : 'Not linked to a PR'} · {session.sourceEventCount} source events</p><small>{timestamp(session.timestamp)} · prompts and responses not stored</small></div></article>)}</div>}
        </div>
        <div className="card admin-evidence-card">
          <div className="cardhead"><div><span className="page-kicker">Linkage</span><h3>{trace.counts.links} AI ↔ PR links</h3></div><span className="sub">correlational, never scored alone</span></div>
          {trace.links.length === 0 ? <p className="admin-empty-inline">No confirmed session-to-PR links yet.</p> : <div className="admin-event-list">{trace.links.map((link) => <article key={`${link.prId}:${link.sessionId}`}><b>{Math.round(link.confidence * 100)}%</b><div><strong>{link.method}</strong><p>Session {link.sessionId.slice(0, 8)} → PR {link.prId.slice(0, 8)}</p></div></article>)}</div>}
        </div>
      </section>

      <section className="card admin-agent-output">
        <div className="cardhead"><div><span className="page-kicker">Agent and rule outputs</span><h3>What Prism recommends—and why</h3></div><span className="sub">numbers are grounded upstream</span></div>
        {trace.agentOutputs.length === 0 ? <p className="admin-empty-inline">Run the live pipeline after fresh evidence arrives to generate grounded outputs.</p> : <div className="admin-agent-grid">{trace.agentOutputs.map((output, index) => <article key={`${output.type}:${index}`}><span>{output.type}</span><h4>{output.title}</h4><p>{output.body}</p><footer>{output.dimension ? <b>{output.dimension}</b> : null}{output.impact !== null ? <b>modeled impact {output.impact}</b> : null}<code>{safeJson(output.evidence)}</code></footer></article>)}</div>}
      </section>

      <div className="admin-footnote">Temporary Admin tab · service-role reads are executed only after the page verifies your Supabase admin role. Prompt text, responses, source code, commands, and tool payloads are not displayed or stored.</div>
    </div>
  );
}
