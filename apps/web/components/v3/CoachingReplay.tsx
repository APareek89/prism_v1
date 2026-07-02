'use client';

// Simulated over-the-shoulder coaching stream — the app's comms-log treatment
// (.commlog/.commitem/.stchip from globals.css). Replays seeded
// v3.coaching_events on a timer so events "appear live". Clearly SIMULATED.

import { useEffect, useRef, useState } from 'react';
import type { CoachingEventRow } from '@prism/contract';

const OUTCOME_CHIP: Record<string, { cls: string; label: string }> = {
  acted: { cls: 'st-adopted', label: 'acted' },
  ignored: { cls: 'st-prog', label: 'ignored' },
  dismissed: { cls: 'st-dismiss', label: 'dismissed' },
};
const INTERVENTION_CHIP: Record<string, string> = {
  enrich: 'st-course', coach: 'st-ack', flag: 'st-dismiss', block: 'st-prog',
};
const TICK_MS = 2200;

export function CoachingReplay({ events }: { events: CoachingEventRow[] }) {
  const [visible, setVisible] = useState(1);
  const [playing, setPlaying] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setVisible((v) => {
        if (v >= events.length) { setPlaying(false); return v; }
        return v + 1;
      });
    }, TICK_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, events.length]);

  const restart = () => { setVisible(1); setPlaying(true); };
  const shown = events.slice(0, visible);

  return (
    <div className="card">
      <div className="cardhead">
        <h3>Over-the-shoulder coaching</h3>
        <span className="sub">SIMULATED replay — plugin metadata only; prompt text never leaves the machine</span>
      </div>
      <div className="daterow" style={{ marginBottom: 12 }}>
        <span className="pill">need-gated · rate-capped ≤3/day · <b>private to you</b></span>
        <button type="button" className="linkbtn" onClick={restart}>
          {playing ? `replaying… ${visible}/${events.length}` : '↻ replay stream'}
        </button>
      </div>
      <div className="commlog">
        {shown.length === 0 ? (
          <p className="muted" style={{ fontSize: 12.5, padding: '8px 0' }}>
            No coaching events seeded for this developer.
          </p>
        ) : null}
        {shown.map((e) => {
          const outcome = OUTCOME_CHIP[e.outcome] ?? OUTCOME_CHIP.ignored!;
          return (
            <div className="commitem" key={e.id}>
              <span className="dt">
                {e.rule_id}
                <br />
                {new Date(e.ts).toISOString().slice(11, 16)}
              </span>
              <span className="ax">
                <b>{e.message}</b>
                <small>gate: {e.gate} · trigger: {e.trigger}</small>
              </span>
              <span style={{ display: 'flex', gap: 6 }}>
                <span className={`stchip ${INTERVENTION_CHIP[e.intervention] ?? 'st-ack'}`}>{e.intervention}</span>
                <span className={`stchip ${outcome.cls}`}>{outcome.label}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
