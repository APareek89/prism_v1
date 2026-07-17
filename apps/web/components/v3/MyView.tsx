'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AgentArtifactRow, CoachingEventRow, IndexDailyRow, InsightRow, RecommendationRow, UserContextRow } from '@prism/contract';
import { InsightList, RecList, V3IndexHero, V3Spectrum } from './detail';
import { CoachingReplay } from './CoachingReplay';
import { AgentGoodBad } from './AgentPanel';
import { GrowthTab, type Area, type CourseVM } from './GrowthTab';
import { PageHeader, MetaChip } from '@/components/layout/PageHeader';
import { Icon } from '@/components/ui/Icon';

interface Props {
  pin: { version: number; date: string | null };
  dev: { id: string; handle: string; name: string; archetype: string };
  devOptions: Array<{ handle: string; name: string }>;
  main: IndexDailyRow | null;
  harness: IndexDailyRow | null;
  insights: InsightRow[];
  recommendations: RecommendationRow[];
  coaching: CoachingEventRow[];
  artifacts: AgentArtifactRow[];
  courses: CourseVM[];
  areas: Area[];
  userContext: UserContextRow[];
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'coach', label: 'Live coach' },
  { id: 'growth', label: 'Growth plan' },
] as const;

export function MyView(props: Props) {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('overview');
  const router = useRouter();
  const actionRecs = useMemo(() => props.recommendations.filter((r) => r.channel === 'nudge' || r.channel === 'rec'), [props.recommendations]);
  const priority = actionRecs[0] ?? null;
  const confidenceValue = props.main?.confidence ?? 0;
  const confidence = confidenceValue >= .75 ? 'High' : confidenceValue >= .55 ? 'Medium' : confidenceValue >= .4 ? 'Low' : 'Insufficient';

  return (
    <div className="page">
      <PageHeader
        kicker="Private workspace"
        title={`Your AI workflow, ${props.dev.name.split(' ')[0]}`}
        description="Understand what is working, get help in the moment, and turn evidence into one practice change at a time."
        actions={
          <label className="meta-chip">
            <span>Demo persona</span>
            <select value={props.dev.handle} onChange={(event) => router.push(`/me?dev=${event.target.value}`)} aria-label="Switch demo persona" style={{ minHeight: 26, padding: '2px 7px', borderRadius: 7, fontSize: 10 }}>
              {props.devOptions.map((dev) => <option key={dev.handle} value={dev.handle}>{dev.name}</option>)}
            </select>
          </label>
        }
        meta={
          <>
            <MetaChip label="Window" value="Trailing 28 days" />
            <MetaChip label="Confidence" value={`${confidence} · ${(confidenceValue * 100).toFixed(0)}%`} />
            <MetaChip label="Config" value={`v${props.pin.version}`} />
            <MetaChip label="Visibility" value="Private to you" tone="accent" />
          </>
        }
      />

      <div className="seg" role="tablist" aria-label="Private workspace sections" style={{ marginBottom: 18 }}>
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} aria-controls={`workspace-${item.id}`} className={tab === item.id ? 'on' : ''} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div id="workspace-overview" role="tabpanel">
          <section className="profile-hero">
            <V3IndexHero main={props.main} />
            <aside className="priority-card" style={{ minHeight: 250 }}>
              <span className="priority-icon"><Icon name="bolt" size={20} /></span>
              <span className="kicker">Focus this week</span>
              <h2>{priority?.title ?? 'Keep building trusted signal'}</h2>
              <p>{priority?.rationale ?? 'Your current evidence does not support a responsible behavior change yet.'}</p>
              {priority ? <div className="priority-meta"><span className="micro-badge">Impact {priority.impact.toFixed(1)}</span><span className="micro-badge">Targets {priority.targets.join(', ')}</span></div> : null}
              <button type="button" className="button primary" onClick={() => setTab('growth')}>Open growth plan <Icon name="arrow-right" size={15} /></button>
            </aside>
          </section>

          <section className="section evidence-grid">
            <V3Spectrum values={{
              usage: props.main?.dimensions?.usage ?? null,
              efficiency: props.main?.dimensions?.efficiency ?? null,
              outcomes: props.main?.dimensions?.outcomes ?? null,
              harness: props.harness?.score ?? null,
            }} />
            <div className="card">
              <div className="cardhead"><div><span className="page-kicker">Your contract</span><h3>What Prism does—and does not do</h3></div><Icon name="shield" size={18} /></div>
              <div className="signal-list">
                <div className="signal-item"><span className="signal-mark"><Icon name="check" size={14} /></span><span className="signal-body"><b>Scores come from deterministic evidence</b><p>No model can change your index.</p></span></div>
                <div className="signal-item"><span className="signal-mark"><Icon name="check" size={14} /></span><span className="signal-body"><b>Your coach reads your own signals</b><p>It cannot invent a number that is not in the evidence block.</p></span></div>
                <div className="signal-item"><span className="signal-mark"><Icon name="check" size={14} /></span><span className="signal-body"><b>Managers never see raw sessions</b><p>Only aggregate signals and anonymized themes leave this workspace.</p></span></div>
              </div>
            </div>
          </section>

          <section className="section"><AgentGoodBad artifacts={props.artifacts} developerId={props.dev.id} /></section>

          <section className="section">
            <details className="detail-disclosure">
              <summary><span>See the deterministic findings behind this view</span><span className="muted2" style={{ fontSize: 10, fontWeight: 400 }}>What the coaching agent is allowed to read</span></summary>
              <div className="detail-body"><InsightList insights={props.insights} title="Evidence behind the coach" sub="Confirmed hypotheses only" /></div>
            </details>
          </section>
        </div>
      ) : null}

      {tab === 'coach' ? (
        <div id="workspace-coach" role="tabpanel">
          <div className="coach-header"><p><strong>Private, need-gated coaching.</strong> Prism can enrich or nudge in the moment; prompt text never leaves your machine.</p><span className="micro-badge">≤ 3 nudges / day</span></div>
          <CoachingReplay events={props.coaching} />
          <section className="section"><RecList recs={actionRecs} title="Actions connected to your coaching" /></section>
        </div>
      ) : null}

      {tab === 'growth' ? (
        <div id="workspace-growth" role="tabpanel">
          <GrowthTab developerId={props.dev.id} courses={props.courses} areas={props.areas} userContext={props.userContext} artifacts={props.artifacts} />
        </div>
      ) : null}

      <div className="foot">Your workspace is private. Managers see function-level aggregates and anonymized themes—not your session content or coaching stream.</div>
    </div>
  );
}
