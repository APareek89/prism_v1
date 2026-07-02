// app/(views)/team/[memberId]/page.tsx
//
// Member drill-in — the v1 member-detail skeleton on the v3.0 model:
// .top → .daterow → .backbtn → .hero (idxcard + spectrum) → KPI tables →
// insights → recommendations. memberId = developer handle.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { activePin, developerByHandle, developerDetail } from '@/lib/v3/read';
import { InsightList, KpiTable, RecList, V3IndexHero, V3Spectrum } from '@/components/v3/detail';

export const dynamic = 'force-dynamic';

export default async function MemberDetailPage({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId: id } = await params;
  const dev = await developerByHandle(id);
  if (!dev) notFound();
  const pin = await activePin();
  const detail = await developerDetail(dev.id, pin);
  if (!detail) notFound();

  const mainKpis = detail.kpis.filter((k) => k.index_kind === 'main');
  const otherKpis = detail.kpis.filter((k) => k.index_kind !== 'main');
  const conf = detail.main?.confidence ?? 0;
  const confLabel = conf >= 0.75 ? 'High' : conf >= 0.55 ? 'Medium' : conf >= 0.4 ? 'Low' : 'Insufficient';

  return (
    <div className="main">
      <div className="top">
        <div className="ttl">
          <h2>{detail.dev.name}</h2>
          <p>@{detail.dev.handle} · {detail.dev.archetype.replaceAll('_', ' ')} · {detail.dev.team} · v3.0 model</p>
        </div>
      </div>

      <div className="daterow">
        <span className="pill">Seat <b>{detail.dev.seat_tier}</b></span>
        <span className="pill">Config <b>v{pin.version}</b></span>
        <span className="pill">Window <b>trailing 28d</b></span>
        <span className="pill" style={{ color: 'var(--warn)' }}>Data <b>demo</b></span>
        <span className="conf">
          confidence
          <span className="bar"><i style={{ width: `${Math.round(conf * 100)}%` }} /></span>
          {confLabel}
        </span>
      </div>

      <Link href="/team" className="backbtn" style={{ textDecoration: 'none' }}>
        ← back to team
      </Link>

      <div className="hero">
        <V3IndexHero main={detail.main} />
        <V3Spectrum values={{ usage: detail.main?.dimensions?.usage ?? null, efficiency: detail.main?.dimensions?.efficiency ?? null, outcomes: detail.main?.dimensions?.outcomes ?? null, harness: detail.harness?.score ?? null }} />
      </div>

      <div className="row r2">
        <KpiTable kpis={mainKpis} title="Core-6 — the main index" sub="raw → anchors → 0–100" />
        <KpiTable kpis={otherKpis} title="Harness + diagnostics" sub="KPI 9 tier-badged · promotes after one clean T1 month" />
      </div>

      <InsightList
        insights={detail.insights}
        title="Insights"
        sub="only CONFIRMED hypotheses · H0 (is the number real?) first"
      />
      <RecList recs={detail.recommendations} title="Recommendations" />

      <div className="foot">
        Every number drills to raw evidence (link method + confidence stored per AI→PR join).
        Who-caught-it routes the action, never the score.
      </div>
    </div>
  );
}
