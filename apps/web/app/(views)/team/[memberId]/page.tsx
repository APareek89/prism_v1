import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getMember, getMemberWell, getMemberComms } from '@/lib/db/member';
import { getIndex, getImprovements } from '@/lib/db/index-read';
import { MemberDetail } from '@/components/panels/MemberDetail';
import { BackLink } from '@/components/ui/BackLink';
import { getAuthUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/roles';
import { canAccessEmployee } from '@/lib/auth/scope';
import { ROUTES, parsePeriod } from '@/lib/config/constants';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Member · Prism' };
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
  if (!user || !can(user, 'view_team_aggregates') || !(await canAccessEmployee(user, memberId))) notFound();

  const member = await getMember(memberId);
  if (!member) notFound();
  const [index, improvements, well, comms] = await Promise.all([
    getIndex('employee', memberId, period),
    getImprovements('employee', memberId),
    getMemberWell(memberId),
    getMemberComms(memberId),
  ]);

  return (
    <div className="page">
      <BackLink href={ROUTES.team}>Back to team</BackLink>
      <MemberDetail member={member.row} meta={member.meta} index={index} improvements={improvements} well={well} comms={comms} />
    </div>
  );
}
