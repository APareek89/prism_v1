// app/(views)/me/page.tsx
//
// My view — the v1 skeleton on the v3.0 model:
// .top header (tabs sit where the PeriodToggle sits on v1 views) → .daterow →
// tab content (hero+insights / coaching / growth) → .foot privacy note.

import { COURSE_CATALOG } from '@prism/engine';
import {
  activePin, agentArtifactsFor, allDevelopers, coachingEventsFor, developerByHandle,
  developerDetail, userContextFor,
} from '@/lib/v3/read';
import { MyView } from '@/components/v3/MyView';

export const dynamic = 'force-dynamic';

const DEFAULT_DEV = 'tom';   // context_hand_carrier — the richest coaching/growth story

export default async function V3MePage({ searchParams }: { searchParams: Promise<{ dev?: string }> }) {
  const { dev: devParam } = await searchParams;
  const handle = devParam ?? DEFAULT_DEV;
  const dev = (await developerByHandle(handle)) ?? (await developerByHandle(DEFAULT_DEV));
  if (!dev) throw new Error('seed developers missing — run npm run v3:reset');

  const pin = await activePin();
  const [detail, coaching, userContext, devs, artifacts] = await Promise.all([
    developerDetail(dev.id, pin),
    coachingEventsFor(dev.id),
    userContextFor(dev.id),
    allDevelopers(),
    agentArtifactsFor(dev.id, pin),
  ]);
  if (!detail) throw new Error('developer detail missing');

  // Improvement areas for self-learning = this dev's confirmed actionable
  // insights (rec/nudge channel), each mapped to the courses that lift its KPI.
  const areas = detail.insights
    .filter((i) => i.channel === 'rec' || i.channel === 'nudge')
    .map((i) => ({
      key: `${i.kpi_id}/${i.hypothesis}`,
      title: i.title,
      body: i.body,
      kpiId: i.kpi_id,
      courseIds: COURSE_CATALOG.filter((c) => (c.targets as string[]).includes(i.kpi_id)).map((c) => c.id),
    }));

  // Course grid: recommended first (targets a weak KPI of this dev).
  const weakKpis = new Set(detail.kpis.filter((k) => k.score !== null && k.score < 60).map((k) => k.kpi_id as string));
  const courses = [...COURSE_CATALOG]
    .sort((a, b) => Number(b.targets.some((t) => weakKpis.has(t))) - Number(a.targets.some((t) => weakKpis.has(t))))
    .map((c) => ({ ...c, recommended: c.targets.some((t) => weakKpis.has(t)) }));

  return (
    <MyView
      pin={{ version: pin.version, date: pin.date }}
      dev={{ id: dev.id, handle: dev.handle, name: dev.name, archetype: dev.archetype }}
      devOptions={devs.map((d) => ({ handle: d.handle, name: d.name }))}
      main={detail.main}
      harness={detail.harness}
      insights={detail.insights}
      recommendations={detail.recommendations}
      coaching={coaching}
      artifacts={artifacts}
      courses={courses}
      areas={areas}
      userContext={userContext}
    />
  );
}
