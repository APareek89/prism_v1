// app/(views)/me/page.tsx
//
// My view — the private employee view. Resolves the current employee via getAuthUser()
// and renders the faithful port of the design's `#employee` section:
//   .top   — "My view · Private to you"
//   .hero  — IndexHero + SpectrumPanel (showVsSquad)        [reused panels, not recreated]
//   .row   — the assigned-course card (CourseCard)
//   .row.r2 — Recent PR insights (PrInsightList) + Recommended for you (RecommendationList)
//   .foot  — the privacy footnote
//
// All data is real, Supabase-backed via lib/db. Until index_daily has rows the DTOs are
// empty/awaiting-signal shapes, so the index renders its EmptyState and the lists render
// their compact EmptyStates — no fabricated numbers. The full faithful structure is here.

import { MetaStrip } from '@/components/layout/MetaStrip';
import { ViewBody } from '@/components/layout/ViewBody';
import { ConfidenceChip } from '@/components/ui/ConfidenceChip';
import { Panel } from '@/components/ui/Panel';
import { EmptyState } from '@/components/ui/EmptyState';
import { IndexHero } from '@/components/panels/IndexHero';
import { SpectrumPanel } from '@/components/panels/SpectrumPanel';
import { CourseCard } from '@/components/panels/CourseCard';
import { PrInsightList } from '@/components/panels/PrInsightList';
import { RecommendationList } from '@/components/panels/RecommendationList';
import { getAuthUser } from '@/lib/auth/session';
import { getMyView, getPrInsights, getRecommendations, getCourse } from '@/lib/db';
import type { ConfidenceBand } from '@/lib/types';

/** Map the DTO confidence-band name onto the ConfidenceChip's lowercase band. */
const CONFIDENCE_BAND: Record<string, ConfidenceBand> = {
  High: 'high',
  Medium: 'medium',
  Low: 'low',
  Insufficient: 'insufficient',
};

export default async function MyView() {
  const user = await getAuthUser();
  const employeeId = user?.employeeId ?? null;

  // No resolvable employee (unauthenticated, no demo) — render chrome + awaiting state.
  if (!employeeId) {
    return (
      <>
        <MetaStrip
          title="My view"
          subtitle="Private to you · visible only to you"
          who={user?.displayName ?? null}
          isDemo={user?.isDemo ?? false}
          actions={<ConfidenceChip band="insufficient" />}
        />
        <ViewBody>
          <Panel eyebrow="your index" title="My index">
            <EmptyState
              title="Sign in to see your view"
              hint="your private AI-Native Index appears once you're signed in"
            />
          </Panel>
        </ViewBody>
      </>
    );
  }

  const [{ index, meta }, prInsights, recommendations, course] = await Promise.all([
    getMyView(employeeId),
    getPrInsights(employeeId),
    getRecommendations(employeeId),
    getCourse(employeeId),
  ]);

  return (
    <>
      <MetaStrip
        title="My view"
        subtitle="Private to you · visible only to you"
        who={user?.displayName ?? meta.scopeLabel}
        isDemo={user?.isDemo ?? false}
        actions={<ConfidenceChip band={CONFIDENCE_BAND[meta.confidence] ?? 'insufficient'} />}
      />
      <ViewBody>
        {/* ── .hero — L1 index card + spectrum vs squad ── */}
        <div className="hero">
          <IndexHero index={index} vsSquad />
          <SpectrumPanel spectrum={index.spectrum} showVsSquad />
        </div>

        {/* ── course row — full-width assigned course ── */}
        <div className="row" style={{ gridTemplateColumns: '1fr' }}>
          <CourseCard course={course} />
        </div>

        {/* ── .row.r2 — Recent PR insights · Recommended for you ── */}
        <div className="row r2">
          <div className="card">
            <div className="cardhead">
              <h3>Recent PR insights</h3>
              <span className="sub">prompt quality · rework · AI-slop</span>
            </div>
            <PrInsightList insights={prInsights} />
          </div>
          <div className="card">
            <div className="cardhead">
              <h3>Recommended for you</h3>
              <span className="sub">monitored for adoption</span>
            </div>
            <RecommendationList recommendations={recommendations} />
          </div>
        </div>

        <div className="foot">
          Your view is private. Managers see squad aggregates and coaching themes, not your raw PR
          list.
        </div>
      </ViewBody>
    </>
  );
}
