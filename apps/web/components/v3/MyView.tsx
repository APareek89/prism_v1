'use client';

// My view (v3 preview) — the v1 page skeleton with three sub-tabs. The tab seg
// sits in the .top right slot exactly where v1 views put the PeriodToggle.
//   Index         — hero + spectrum + insights. NO actions here.
//   Live coaching — SIMULATED replay of seeded v3.coaching_events.
//   Growth        — courses + improvement areas + real v3.user_context writes.

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CoachingEventRow, IndexDailyRow, InsightRow, RecommendationRow, UserContextRow } from '@prism/contract';
import { InsightList, RecList, V3IndexHero, V3Spectrum } from './detail';
import { CoachingReplay } from './CoachingReplay';
import { GrowthTab, type Area, type CourseVM } from './GrowthTab';

interface Props {
  pin: { version: number; date: string | null };
  dev: { id: string; handle: string; name: string; archetype: string };
  devOptions: Array<{ handle: string; name: string }>;
  main: IndexDailyRow | null;
  harness: IndexDailyRow | null;
  insights: InsightRow[];
  recommendations: RecommendationRow[];
  coaching: CoachingEventRow[];
  courses: CourseVM[];
  areas: Area[];
  userContext: UserContextRow[];
}

const TABS = ['Index', 'Live coaching', 'Growth'] as const;

export function MyView(p: Props) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Index');
  const router = useRouter();
  const actionRecs = useMemo(
    () => p.recommendations.filter((r) => r.channel === 'nudge' || r.channel === 'rec'),
    [p.recommendations],
  );
  const conf = p.main?.confidence ?? 0;
  const confLabel = conf >= 0.75 ? 'High' : conf >= 0.55 ? 'Medium' : conf >= 0.4 ? 'Low' : 'Insufficient';

  return (
    <div className="main">
      <div className="top">
        <div className="ttl">
          <h2>My view</h2>
          <p>Private to you · {p.dev.name} · {p.dev.archetype.replaceAll('_', ' ')} · v3.0 preview</p>
        </div>
        <div className="seg" role="tablist" aria-label="My view tabs">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="daterow">
        <span className="pill">Config <b>v{p.pin.version}</b></span>
        <span className="pill">Window <b>trailing 28d</b></span>
        <span className="pill" style={{ color: 'var(--warn)' }}>Data <b>demo</b></span>
        <span className="conf">
          confidence
          <span className="bar"><i style={{ width: `${Math.round(conf * 100)}%` }} /></span>
          {confLabel}
        </span>
        <span className="pill" style={{ marginLeft: 'auto' }}>
          demo switcher{' '}
          <select
            value={p.dev.handle}
            onChange={(e) => router.push(`/v3/me?dev=${e.target.value}`)}
            aria-label="Switch developer (demo only)"
            style={{
              background: 'var(--panel2)', color: 'var(--ink)', border: '1px solid var(--line2)',
              borderRadius: 6, padding: '3px 6px', fontFamily: 'var(--mono)', fontSize: 11, marginLeft: 6,
            }}
          >
            {p.devOptions.map((d) => (
              <option key={d.handle} value={d.handle}>@{d.handle}</option>
            ))}
          </select>
        </span>
      </div>

      {tab === 'Index' ? (
        <>
          <div className="hero">
            <V3IndexHero main={p.main} />
            <V3Spectrum main={p.main} harness={p.harness} />
          </div>
          <InsightList
            insights={p.insights}
            title="Your insights"
            sub="read-only — actions live in Live coaching (in-flow) and Growth (self-driven)"
          />
        </>
      ) : null}

      {tab === 'Live coaching' ? (
        <>
          <CoachingReplay events={p.coaching} />
          <RecList recs={actionRecs} title="Open recommendations tied to your coaching" />
        </>
      ) : null}

      {tab === 'Growth' ? (
        <GrowthTab
          developerId={p.dev.id}
          courses={p.courses}
          areas={p.areas}
          userContext={p.userContext}
        />
      ) : null}

      <div className="foot">
        Your view is private. Managers see aggregates and anonymized coaching themes — never your
        raw sessions or coaching stream.
      </div>
    </div>
  );
}
