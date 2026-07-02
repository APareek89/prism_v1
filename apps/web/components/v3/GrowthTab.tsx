'use client';

// Growth tab — the app's own treatments end to end: the v1 `.course` card for the
// course grid (SVG sparkline icon, no external images), `.wellitem` for
// improvement areas, `.stchip` chips for the "what's driving improvement" strip.
// Buttons INSERT real rows into v3.user_context (optimistic UI + rollback).

import { useMemo, useState } from 'react';
import type { UserContextRow } from '@prism/contract';

export interface CourseVM {
  id: string;
  title: string;
  minutes: number;
  level: string;
  blurb: string;
  targets: string[];
  hue: number;
  recommended: boolean;
}

export interface Area {
  key: string;      // `${kpi_id}/${hypothesis}` — the user_context ref
  title: string;
  body: string;
  kpiId: string;
  courseIds: string[];
}

interface Props {
  developerId: string;
  courses: CourseVM[];
  areas: Area[];
  userContext: UserContextRow[];
}

// KPI family → the .wellitem category treatments (globals.css).
const AREA_CAT: Record<string, { cls: string; glyph: string }> = {
  ai_share: { cls: 'prompt', glyph: 'U' },
  cadence: { cls: 'prompt', glyph: 'U' },
  iterations: { cls: 'waste', glyph: 'E' },
  tokens: { cls: 'waste', glyph: 'E' },
  revert: { cls: 'qual', glyph: 'O' },
  rework: { cls: 'qual', glyph: 'O' },
  reliability: { cls: 'qual', glyph: 'O' },
  linkage: { cls: 'skill', glyph: '🔗' },
};

export function GrowthTab({ developerId, courses, areas, userContext }: Props) {
  // Optimistic completion state seeded from the real table.
  const [done, setDone] = useState<Set<string>>(
    () => new Set(userContext.map((u) => `${u.kind}:${u.ref}`)),
  );
  const [pending, setPending] = useState<Set<string>>(new Set());

  const record = async (kind: 'course_completed' | 'adopted', ref: string, label: string) => {
    const key = `${kind}:${ref}`;
    if (done.has(key) || pending.has(key)) return;
    setPending((s) => new Set(s).add(key));
    setDone((s) => new Set(s).add(key));               // optimistic
    try {
      const res = await fetch('/api/v3/user-context', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ developerId, kind, ref, meta: { label } }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch {
      setDone((s) => { const n = new Set(s); n.delete(key); return n; });   // roll back
    } finally {
      setPending((s) => { const n = new Set(s); n.delete(key); return n; });
    }
  };

  const drivingItems = useMemo(() => {
    const labels: string[] = [];
    for (const key of done) {
      const [kind, ...refParts] = key.split(':');
      const ref = refParts.join(':');
      if (kind === 'course_completed') {
        const c = courses.find((x) => x.id === ref);
        if (c) labels.push(`completed: ${c.title}`);
      } else {
        const a = areas.find((x) => x.key === ref);
        if (a) labels.push(`adopted: ${a.title}`);
      }
    }
    return labels;
  }, [done, courses, areas]);

  return (
    <>
      {/* (C) the management-facing evidence strip — fed from v3.user_context */}
      <div className="card">
        <div className="cardhead">
          <h3>What&apos;s driving your improvement</h3>
          <span className="sub">real rows in v3.user_context · re-verified from data in 14 days</span>
        </div>
        {drivingItems.length === 0 ? (
          <p className="muted" style={{ fontSize: 12.5 }}>
            Nothing recorded yet — complete a course or adopt an improvement below and it lands
            here (and in the management view).
          </p>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {drivingItems.map((l) => (
              <span className="stchip st-adopted" key={l}>✓ {l}</span>
            ))}
          </div>
        )}
      </div>

      {/* (B) improvement areas from confirmed-hypothesis insights */}
      <div className="card">
        <div className="cardhead">
          <h3>Improvement areas for self-learning</h3>
          <span className="sub">derived from YOUR confirmed hypotheses — not generic advice</span>
        </div>
        {areas.length === 0 ? (
          <p className="muted" style={{ fontSize: 12.5 }}>No actionable areas — every hypothesis test came back clean.</p>
        ) : (
          <div className="well">
            {areas.map((a) => {
              const key = `adopted:${a.key}`;
              const isDone = done.has(key);
              const cat = AREA_CAT[a.kpiId] ?? { cls: 'skill', glyph: 'H' };
              return (
                <div className="wellitem" key={a.key}>
                  <span className={`cat ${cat.cls}`}>{cat.glyph}</span>
                  <span className="tx">
                    <b>{a.title}</b>
                    <span className="cause">
                      {a.body} <em>{a.kpiId.replaceAll('_', ' ')}</em>
                    </span>
                    <button
                      type="button"
                      className="linkbtn"
                      style={{ marginTop: 8, ...(isDone ? { color: 'var(--good)', borderColor: 'var(--good)' } : {}) }}
                      disabled={pending.has(key)}
                      onClick={() => record('adopted', a.key, a.title)}
                    >
                      {isDone ? '✓ adopted — tracked' : 'I adopted this'}
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* (A) embedded course grid — the v1 .course card, generated SVG icons only */}
      <div className="card">
        <div className="cardhead">
          <h3>Courses</h3>
          <span className="sub">recommended first, matched to your weak KPIs · generated thumbnails, no external images</span>
        </div>
        <div className="row r2" style={{ marginBottom: 0 }}>
          {courses.map((c) => {
            const key = `course_completed:${c.id}`;
            const isDone = done.has(key);
            return (
              <div className="course" key={c.id}>
                <span className="ico" aria-hidden>
                  <svg viewBox="0 0 24 24" width="22" height="22">
                    <polyline
                      points={`2,${18 - (c.hue % 5)} 8,${12 + (c.hue % 6)} 14,${8 + (c.hue % 4)} 22,5`}
                      fill="none"
                      stroke={`hsl(${c.hue} 70% 65%)`}
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <circle cx="22" cy="5" r="2" fill={`hsl(${c.hue} 70% 65%)`} />
                  </svg>
                </span>
                <span className="meta">
                  <b>{c.title}</b>
                  <p>{c.blurb}</p>
                  <p className="mono" style={{ fontSize: 10.5, marginTop: 5 }}>
                    {c.minutes} min · {c.level}
                    {c.recommended ? <span style={{ color: 'var(--good)' }}> · recommended for you</span> : null}
                  </p>
                </span>
                <button
                  type="button"
                  className="opencourse"
                  style={{ background: 'none', cursor: 'pointer', ...(isDone ? { color: 'var(--good)', borderColor: 'var(--good)' } : {}) }}
                  disabled={pending.has(key)}
                  onClick={() => record('course_completed', c.id, c.title)}
                >
                  {isDone ? '✓ Completed' : 'Mark complete'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
