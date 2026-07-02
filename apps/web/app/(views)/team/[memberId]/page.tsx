// app/(views)/team/[memberId]/page.tsx
//
// Member detail (drill-in) — the faithful M1 port of the `#memberdetail` section of
// the approved design. Renders the BackLink to the squad + the MemberDetail composite
// (IndexHero + SpectrumPanel "vs squad" + InsightList + GoingWellList + CommsLog).
//
// Server Component. Access control is real even in the demo (architecture §12.5):
// managers see coaching, not raw PRs; no visibility → notFound() (don't reveal a
// member's existence to an unauthorized viewer). An unknown id also 404s. All panels
// degrade to their own empty treatments — no fabricated values.

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getMember, getMemberWell, getMemberComms } from '@/lib/db/member';
import { getIndex, getImprovements } from '@/lib/db/index-read';
import { MemberDetail } from '@/components/panels/MemberDetail';
import { BackLink } from '@/components/ui/BackLink';
import { getAuthUser } from '@/lib/auth/session';
import { canViewMember } from '@/lib/auth/roles';
import { ROUTES, parsePeriod } from '@/lib/config/constants';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ memberId: string }>;
}): Promise<Metadata> {
  const { memberId } = await params;
  const member = await getMember(memberId);
  if (!member) return { title: 'Member · Prism' };
  return { title: `${member.row.name} · Member detail · Prism` };
}

export default async function MemberDetailView({
  params,
  searchParams,
}: {
  params: Promise<{ memberId: string }>;
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const { memberId } = await params;
  const sp = await searchParams;
  const period = parsePeriod(sp.period);

  const user = await getAuthUser();

  // No member visibility → 404 (don't reveal existence to an unauthorized viewer).
  if (!user || !canViewMember(user, memberId)) {
    notFound();
  }

  const member = await getMember(memberId);
  // Unknown / un-onboarded id → 404.
  if (!member) {
    notFound();
  }

  const [index, improvements, well, comms] = await Promise.all([
    getIndex('employee', memberId, period),
    getImprovements('employee', memberId),
    getMemberWell(memberId),
    getMemberComms(memberId),
  ]);

  return (
    <div className="main">
      <BackLink href={ROUTES.team}>Back to squad</BackLink>
      <MemberDetail
        member={member.row}
        meta={member.meta}
        index={index}
        improvements={improvements}
        well={well}
        comms={comms}
      />
    </div>
  );
}
