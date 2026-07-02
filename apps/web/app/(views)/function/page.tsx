// app/(views)/function/page.tsx
//
// Function view — the v1 page skeleton (.top → .daterow → .hero → cards → .foot)
// on the v3.0 model: MAIN index (Usage 15 / Efficiency 35 / Outcomes 50 over the
// Core-6) with the HARNESS index alongside, function-level = median across the
// squad's published scores. Improvements and the linkage engine replace the v1
// "top 5 / what moved" pair with their v3 equivalents.

import { activePin } from '@/lib/v3/read';
import { functionRollup } from '@/lib/v3/rollup';
import { V3Spectrum } from '@/components/v3/detail';
import { EmptyState } from '@/components/ui/EmptyState';
import { BAND_COLORS } from '@/app/tokens';

export const dynamic = 'force-dynamic';

const BAND_BLURBS: Record<string, string> = {
  L0: 'Dormant — AI touches almost nothing that ships.',
  L1: 'Basic — early, ad-hoc AI use; the habit is forming.',
  L2: 'Productive — AI is part of the weekly workflow.',
  L3: 'Workflow — AI-first habits with reliable outcomes.',
  L4: 'Power — high leverage, strong outcomes, harness in place.',
  L5: 'Multiplier — others ship faster because of your assets.',
};

const CHANNEL_LABEL: Record<string, string> = {
  fix: 'fix data first', nudge: 'in-flow nudge', rec: 'recommendation', team: 'team/process', org: 'platform/admin',
};

export default async function FunctionView() {
  const pin = await activePin();
  const roll = await functionRollup(pin);
  const confLabel = roll.confidence >= 0.75 ? 'High' : roll.confidence >= 0.55 ? 'Medium' : roll.confidence >= 0.4 ? 'Low' : 'Insufficient';

  return (
    <div className="main">
      <div className="top">
        <div className="ttl">
          <h2>Function</h2>
          <p>Function-level AI-Native Index · v3.0 model · {roll.total} developers</p>
        </div>
      </div>

      <div className="daterow">
        <span className="pill">Window <b>trailing 28d</b></span>
        <span className="pill">Engineers <b>{roll.total}</b></span>
        <span className="pill">Config <b>v{pin.version}</b></span>
        <span className="pill">As-of <b>{pin.date ?? '—'}</b></span>
        <span className="conf">
          confidence
          <span className="bar"><i style={{ width: `${Math.round(roll.confidence * 100)}%` }} /></span>
          {confLabel}
        </span>
      </div>

      <div className="hero">
        <div className="card idxcard">
          {roll.medianMain === null ? (
            <>
              <div className="eyebrow">Main index · v3.0 · function</div>
              <EmptyState title="Awaiting signal" hint="the index appears once enough signal accrues" />
            </>
          ) : (
            <>
              <div>
                <div className="eyebrow">Main index · v3.0 · median of {roll.publishedCount} published</div>
                <div className="bignum">
                  {roll.medianMain.toFixed(1)}
                  <span>/100</span>
                </div>
                <div className="delta flat">harness index {roll.medianHarness === null ? '—' : roll.medianHarness.toFixed(1)} · separate, never mixed in</div>
              </div>
              {roll.band ? (
                <div className="lvl">
                  Band <b style={{ color: BAND_COLORS[roll.band] }}>{roll.band}</b>
                  {' — '}{BAND_BLURBS[roll.band]}
                </div>
              ) : null}
            </>
          )}
        </div>
        <V3Spectrum
          values={{
            usage: roll.dims.usage,
            efficiency: roll.dims.efficiency,
            outcomes: roll.dims.outcomes,
            harness: roll.medianHarness,
          }}
        />
      </div>

      <div className="row r2">
        <div className="card tok">
          <div className="cardhead">
            <h3>Tokens / merged PR</h3>
            <span className="sub">median · in-scope only · tokens, never dollars</span>
          </div>
          <div className="bignum">
            {roll.tokensPerPrK === null ? '—' : `${Math.round(roll.tokensPerPrK)}k`}
          </div>
          <span className="unit">
            AI share (median) {roll.aiSharePct === null ? '—' : `${roll.aiSharePct.toFixed(0)}%`} · exploration visible, never scored
          </span>
        </div>

        <div className="card">
          <div className="cardhead">
            <h3>Linkage engine</h3>
            <span className="sub">harness gaps that PROVABLY cost outcomes · within-person · never scored</span>
          </div>
          {roll.linkage.length === 0 ? (
            <EmptyState compact title="No confirmed links yet" hint="links appear when a practice-present vs practice-absent contrast exists" />
          ) : (
            <div className="ins">
              {roll.linkage.map((l) => (
                <div className="insitem" key={`${l.dev}-${l.title}`}>
                  <span className="n">🔗</span>
                  <div className="tx">
                    <b>{l.dev}: {l.title}</b>
                    <small>{l.body}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="cardhead">
          <h3>Top improvements across the squad</h3>
          <span className="sub">ranked by modeled impact = (100 − score) × index weight</span>
        </div>
        {roll.topRecommendations.length === 0 ? (
          <EmptyState compact title="No open recommendations" hint="every targeted KPI is at or near target" />
        ) : (
          <div className="prlist">
            {roll.topRecommendations.map((r, i) => (
              <div className="pritem" key={r.ref}>
                <span className={`prtag ${r.impact >= 40 ? 'bad' : r.impact >= 20 ? 'warn' : 'ok'}`}>#{i + 1}</span>
                <div className="prbody">
                  <b>{r.title}</b>
                  <small>{r.rationale}</small>
                  <div className="sug">
                    impact {r.impact.toFixed(1)} · {r.devs} developer{r.devs > 1 ? 's' : ''} · owner {r.owner} · {CHANNEL_LABEL[r.channel] ?? r.channel}
                  </div>
                </div>
                <span className="szbadge">{r.channel}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="foot">
        The function headline is the unit of accountability. Per-engineer numbers exist for
        coaching — open Team to drill in. The harness index publishes separately with its own
        confidence; the linkage engine connects the two with evidence, never assertion.
      </div>
    </div>
  );
}
