import type { CSSProperties } from 'react';
import Link from 'next/link';
import { activePin } from '@/lib/v3/read';
import { functionRollup } from '@/lib/v3/rollup';
import { PageHeader, MetaChip } from '@/components/layout/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { BAND_COLORS, DIMENSION_HUES } from '@/app/tokens';

export const dynamic = 'force-dynamic';

const BAND_COPY: Record<string, { name: string; description: string }> = {
  L0: { name: 'Dormant', description: 'AI rarely reaches shipped work. Fix access and capture before coaching behavior.' },
  L1: { name: 'Basic', description: 'The habit is forming, but AI-assisted delivery is still ad hoc.' },
  L2: { name: 'Productive', description: 'AI is part of weekly delivery; the next gain comes from making the workflow repeatable.' },
  L3: { name: 'Workflow', description: 'AI-first habits are producing reliable outcomes across the function.' },
  L4: { name: 'Power', description: 'The function is realizing strong leverage with durable delivery outcomes.' },
  L5: { name: 'Multiplier', description: 'The function compounds its advantage by turning individual practice into shared capability.' },
};

const DIMENSIONS = [
  { key: 'usage' as const, label: 'Usage', question: 'Is AI part of shipped work?', weight: 15, color: DIMENSION_HUES.usage },
  { key: 'efficiency' as const, label: 'Efficiency', question: 'Is the workflow economical?', weight: 35, color: DIMENSION_HUES.efficiency },
  { key: 'outcomes' as const, label: 'Outcomes', question: 'Does the work hold up?', weight: 50, color: DIMENSION_HUES.effectiveness },
];

function signalLabel(score: number | null) {
  if (score === null) return 'Awaiting signal';
  if (score < 35) return 'Primary constraint';
  if (score < 55) return 'Building';
  if (score < 70) return 'Healthy';
  return 'Strong';
}

export default async function FunctionView() {
  const pin = await activePin();
  const roll = await functionRollup(pin);
  const confidence = roll.confidence >= .75 ? 'High' : roll.confidence >= .55 ? 'Medium' : roll.confidence >= .4 ? 'Low' : 'Insufficient';
  const band = roll.band ? BAND_COPY[roll.band] : null;
  const priority = roll.topRecommendations[0] ?? null;
  const measuredDims = DIMENSIONS.filter((d) => roll.dims[d.key] !== null);
  const constraint = measuredDims.sort((a, b) => (roll.dims[a.key] ?? 101) - (roll.dims[b.key] ?? 101))[0] ?? null;

  return (
    <div className="page">
      <PageHeader
        kicker="Engineering function"
        title="Is AI making the work better?"
        description="A decision view of adoption, workflow efficiency, and whether AI-assisted changes survive in production."
        actions={<Link href="/team" className="button">Review people <Icon name="arrow-right" size={15} /></Link>}
        meta={
          <>
            <MetaChip label="Window" value="Trailing 28 days" />
            <MetaChip label="As of" value={pin.date ?? 'Awaiting compute'} />
            <MetaChip label="Engineers" value={roll.total} />
            <MetaChip label="Config" value={`v${pin.version}`} />
          </>
        }
      />

      <section className="overview-hero" aria-label="Function impact summary">
        <div className="impact-card">
          <div className="impact-copy">
            <span className="eyebrow">Main index · function median</span>
            <h2 className="impact-title">
              {roll.medianMain === null || !band ? (
                <>There is not enough trusted signal to publish an index yet.</>
              ) : (
                <>Your function is <em>{band.name}</em>.</>
              )}
            </h2>
            <p>{band?.description ?? 'Connect enough delivery and AI-session evidence to publish a defensible result.'}</p>
            <div className="impact-footer">
              <span className="confidence-inline"><span className="confidence-dot" /> {confidence} confidence · {roll.publishedCount}/{roll.total} published</span>
              {constraint ? <span className="micro-badge">Constraint: {constraint.label}</span> : null}
            </div>
          </div>
          <div
            className="score-ring"
            style={{ '--score': roll.medianMain ?? 0, '--ring-color': roll.band ? BAND_COLORS[roll.band] : '#879188' } as CSSProperties}
            aria-label={`Main index ${roll.medianMain?.toFixed(1) ?? 'not published'} out of 100`}
          >
            <span className="score-ring-value">
              {roll.medianMain === null ? '—' : roll.medianMain.toFixed(1)}
              <small>Main / 100</small>
            </span>
          </div>
        </div>

        <aside className="priority-card">
          <span className="priority-icon"><Icon name="target" size={21} /></span>
          <span className="kicker">Highest-leverage move</span>
          <h2>{priority?.title ?? 'Keep the current system healthy'}</h2>
          <p>{priority?.rationale ?? 'No open recommendation currently clears the action threshold.'}</p>
          {priority ? (
            <div className="priority-meta">
              <span className="micro-badge">{priority.devs} people</span>
              <span className="micro-badge">Owner: {priority.owner}</span>
              <span className="micro-badge">Impact {priority.impact.toFixed(1)}</span>
            </div>
          ) : null}
          <Link href="/team" className="button primary">See who needs support <Icon name="arrow-right" size={15} /></Link>
        </aside>
      </section>

      <section className="section" aria-labelledby="index-shape">
        <div className="section-head">
          <div><span className="page-kicker">Index shape</span><h2 id="index-shape">Where value is being created—or lost</h2></div>
          <p>MAIN measures outcomes. HARNESS is a separate practice index and never changes the MAIN score.</p>
        </div>
        <div className="metric-grid">
          {DIMENSIONS.map((d) => {
            const value = roll.dims[d.key];
            return (
              <div className="metric-card" key={d.key}>
                <div className="metric-top">
                  <span className="metric-label"><i style={{ background: d.color }} />{d.label}</span>
                  <span className="metric-weight">{d.weight}% of MAIN</span>
                </div>
                <div className="metric-score">{value === null ? '—' : value.toFixed(1)} <small>/ 100</small></div>
                <div className="metric-track"><i style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%`, background: d.color }} /></div>
                <p className="metric-caption">{signalLabel(value)} · {d.question}</p>
              </div>
            );
          })}
          <div className="metric-card" style={{ background: '#faf6ff', borderColor: '#e3d8ef' }}>
            <div className="metric-top">
              <span className="metric-label"><i style={{ background: DIMENSION_HUES.proficiency }} />Harness</span>
              <span className="metric-weight">Separate index</span>
            </div>
            <div className="metric-score">{roll.medianHarness === null ? '—' : roll.medianHarness.toFixed(1)} <small>/ 100</small></div>
            <div className="metric-track"><i style={{ width: `${Math.max(0, Math.min(100, roll.medianHarness ?? 0))}%`, background: DIMENSION_HUES.proficiency }} /></div>
            <p className="metric-caption">{signalLabel(roll.medianHarness)} · Are compounding practices installed?</p>
          </div>
        </div>
      </section>

      <section className="section evidence-grid">
        <div className="card">
          <div className="cardhead">
            <div><span className="page-kicker">Causal evidence</span><h3>What the linkage engine can defend</h3></div>
            <span className="sub">Within-person contrasts only</span>
          </div>
          <div className="signal-list">
            {roll.linkage.length ? roll.linkage.slice(0, 4).map((item) => (
              <div className="signal-item" key={`${item.dev}-${item.title}`}>
                <span className="signal-mark"><Icon name="trend" size={15} /></span>
                <span className="signal-body"><b>{item.dev} · {item.title}</b><p>{item.body}</p></span>
                <span className="micro-badge">linked</span>
              </div>
            )) : (
              <div className="empty-filter">No causal link is publishable yet. Prism will not imply one from cross-person correlation.</div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="cardhead">
            <div><span className="page-kicker">Action queue</span><h3>What comes after the top move</h3></div>
            <span className="sub">Modeled impact</span>
          </div>
          <div className="action-list">
            {roll.topRecommendations.slice(1, 5).map((item, index) => (
              <div className="action-item" key={item.ref}>
                <span className="action-rank">{index + 2}</span>
                <span className="action-body"><b>{item.title}</b><p>{item.devs} people · {item.owner} owns the change</p></span>
                <span className="micro-badge">{item.impact.toFixed(0)}</span>
              </div>
            ))}
            {roll.topRecommendations.length <= 1 ? <div className="empty-filter">No secondary actions are open.</div> : null}
          </div>
        </div>
      </section>

      <section className="section trust-strip" aria-label="Measurement trust">
        <div className="trust-item"><span>Confidence</span><strong>{confidence} · {(roll.confidence * 100).toFixed(0)}%</strong></div>
        <div className="trust-item"><span>Coverage</span><strong>{roll.publishedCount} of {roll.total} published</strong></div>
        <div className="trust-item"><span>Tokens / merged PR</span><strong>{roll.tokensPerPrK === null ? 'No signal' : `${Math.round(roll.tokensPerPrK)}k tokens`}</strong></div>
        <div className="trust-item"><span>AI share</span><strong>{roll.aiSharePct === null ? 'No signal' : `${roll.aiSharePct.toFixed(0)}% median`}</strong></div>
      </section>

      <div className="foot">Function-level scores are the unit of accountability. Individual views exist to support coaching, never to create a performance leaderboard.</div>
    </div>
  );
}
