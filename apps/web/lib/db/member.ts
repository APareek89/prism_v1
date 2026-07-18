// lib/db/member.ts
//
// Member-scope + My-view reads: the member-detail header (row + meta), "what's going
// well", the comms log, the My-view index, PR-level coaching insights, recommendations,
// and the assigned course. All employee-keyed and N-ready.
//
// Empty when no rows: getMember returns null for an unknown id, the list reads return
// [], getCourse returns null, getMyView returns an empty IndexDTO + empty MetaDTO.

import type {
  MemberRowDTO,
  MetaDTO,
  IndexDTO,
  WellItemDTO,
  CommsEntryDTO,
  PrInsightDTO,
  RecommendationDTO,
  CourseDTO,
  DimensionTag,
  Dimension,
} from '@/lib/ui/view-models';
import { DIMENSION_TAG } from '@/lib/ui/view-models';
import { NO_SIGNAL, fmtTokens } from '@/lib/format';
import { getIndex, getMeta } from './index-read';
import type { Period } from '@/lib/config/constants';
import {
  db,
  selectRows,
  selectOne,
  computeWindow,
  deltaDto,
  getCurrentEmployeeId,
  type DbReadFilter,
} from './_base';

// ─────────────────────────────────────────────────────────────────────────────
// getMember (roster row + meta strip for the detail view)
// ─────────────────────────────────────────────────────────────────────────────

interface EmployeeFull {
  id: string;
  function_id: string;
  name: string;
  email: string | null;
  designation?: string | null;
  active: boolean;
}

interface MemberIndexLite {
  date: string;
  l1: number | null;
  l2_usage: number | null;
  l2_eff: number | null;
  l2_effness: number | null;
  l2_prof: number | null;
  tokens_per_pr: number | null;
}

export async function getMember(
  memberId: string,
): Promise<{ row: MemberRowDTO; meta: MetaDTO } | null> {
  const client = await db();
  const emp = (await selectOne(() =>
    client
      .from('employees')
      .select('id, function_id, name, email, designation, active')
      .eq('id', memberId)
      .maybeSingle(),
  )) as EmployeeFull | null;

  if (!emp) return null;

  const idxRows = await memberIndexRows(memberId);
  const top = idxRows.length > 0 ? idxRows[0]! : null;
  const base = pickBaseline(idxRows, 7);
  const d7delta =
    top && base && top.l1 !== null && base.l1 !== null ? top.l1 - base.l1 : null;

  const meId = await getCurrentEmployeeId();

  const row: MemberRowDTO = {
    id: emp.id,
    name: emp.name,
    role: emp.designation ?? '',
    you: meId !== null && emp.id === meId,
    l1: top?.l1 ?? null,
    l2: {
      usage: top?.l2_usage ?? null,
      eff: top?.l2_eff ?? null,
      effness: top?.l2_effness ?? null,
      prof: top?.l2_prof ?? null,
    },
    tokensPerPrLabel: top?.tokens_per_pr != null ? fmtTokens(top.tokens_per_pr) : NO_SIGNAL,
    d7: deltaDto(d7delta),
  };

  const meta = await getMeta('employee', emp.id, 'weekly', emp.name);
  return { row, meta };
}

async function memberIndexRows(memberId: string): Promise<MemberIndexLite[]> {
  const client = await db();
  const { start } = computeWindow();
  const raw = await selectRows(
    client
      .from('index_daily')
      .select('date, l1, l2_usage, l2_eff, l2_effness, l2_prof, tokens_per_pr, scope, scope_id')
      .eq('scope', 'employee')
      .eq('scope_id', memberId)
      .order('date', { ascending: false }) as DbReadFilter,
  );
  return (raw as unknown as MemberIndexLite[]).filter((r) => !start || r.date >= start);
}

function pickBaseline(rowset: MemberIndexLite[], minGap: number): MemberIndexLite | null {
  if (rowset.length === 0) return null;
  const top = rowset[0]!;
  const cutoff = isoMinus(top.date, minGap);
  for (const r of rowset) {
    if (r.date <= cutoff) return r;
  }
  return rowset.length > minGap ? (rowset[minGap] ?? null) : null;
}

function isoMinus(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Date(d.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// getMemberWell ("what's going well — and why")
// ─────────────────────────────────────────────────────────────────────────────

interface InsightLite {
  title: string;
  body: string;
  dimension: string | null;
  kind: string;
  created_at: string;
}

const WELL_CATEGORIES: WellItemDTO['category'][] = ['prompt', 'skill', 'waste', 'qual'];

export async function getMemberWell(memberId: string): Promise<WellItemDTO[]> {
  const insights = await employeeInsights(memberId, 'attribution');
  return insights.map((row, i) => ({
    category: WELL_CATEGORIES[i % WELL_CATEGORIES.length]!,
    title: row.title,
    cause: row.body,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// getMemberComms (communications/nudges sent)
// ─────────────────────────────────────────────────────────────────────────────

interface CommsLite {
  channel: string;
  date: string | null;
  sent_at: string | null;
  opened_at: string | null;
}

export async function getMemberComms(memberId: string): Promise<CommsEntryDTO[]> {
  const client = await db();
  const raw = (await selectRows(
    client
      .from('comms_log')
      .select('channel, date, sent_at, opened_at, employee_id')
      .eq('employee_id', memberId)
      .order('sent_at', { ascending: false }) as DbReadFilter,
  )) as unknown as CommsLite[];

  return raw.map((c) => {
    // comms_log has no subject/delivered_at; each row is a delivered daily digest.
    // Status derives from sent_at/opened_at only (never a delivered_at column).
    const status: CommsEntryDTO['status'] = c.opened_at ? 'ack' : 'prog';
    const statusLabel = c.opened_at ? 'opened' : c.sent_at ? 'sent' : 'queued';
    const when = c.sent_at ?? c.date;
    return {
      dateLabel: when ? shortDate(when) : NO_SIGNAL,
      channel: c.channel ?? 'email',
      action: 'Daily digest',
      status,
      statusLabel,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// getMyView (current employee's index + meta)
// ─────────────────────────────────────────────────────────────────────────────

export async function getMyView(
  employeeId: string,
  period: Period = 'weekly',
): Promise<{ index: IndexDTO; meta: MetaDTO }> {
  const [index, meta] = await Promise.all([
    getIndex('employee', employeeId, period),
    getMeta('employee', employeeId, period, 'My view'),
  ]);
  return { index, meta };
}

// ─────────────────────────────────────────────────────────────────────────────
// getPrInsights (PR-level coaching)
// ─────────────────────────────────────────────────────────────────────────────

interface PrInsightLite {
  title: string;
  body: string;
  dimension: string | null;
  evidence_jsonb: unknown;
  created_at: string;
}

export async function getPrInsights(employeeId: string): Promise<PrInsightDTO[]> {
  // pr_level insights are scoped to the employee; flag/size live in evidence_jsonb.
  const raw = await employeeInsights(employeeId, 'pr_level');
  return (raw as unknown as PrInsightLite[]).map((row, i) => {
    const refs = evidenceRefs(row.evidence_jsonb);
    const flag = inferFlag(row.title, row.body);
    const tone = flagTone(flag);
    const dim = normalizeDimension(row.dimension);
    return {
      prNumber: extractPrNumber(refs) ?? `#${i + 1}`,
      flag,
      flagTone: tone,
      title: row.title,
      sizeBucket: inferSize(refs),
      summary: row.body,
      suggestion: null,
      tag: dim ? DIMENSION_TAG[dim] : 'usage',
      tagLabel: flagLabel(flag),
    };
  });
}

/**
 * Pull a list of string refs out of the evidence_jsonb payload. The column is jsonb
 * (object or array); we accept either a bare array of strings or a `{ refs: [...] }`
 * shape, and fall back to [] otherwise. No fabricated refs.
 */
function evidenceRefs(evidence: unknown): string[] | null {
  if (Array.isArray(evidence)) {
    return evidence.filter((v): v is string => typeof v === 'string');
  }
  if (evidence && typeof evidence === 'object') {
    const refs = (evidence as { refs?: unknown }).refs;
    if (Array.isArray(refs)) return refs.filter((v): v is string => typeof v === 'string');
  }
  return null;
}

function inferFlag(title: string, body: string): PrInsightDTO['flag'] {
  const t = `${title} ${body}`.toLowerCase();
  if (t.includes('revert')) return 'revert';
  if (t.includes('slop')) return 'ai-slop';
  if (t.includes('re-prompt') || t.includes('reprompt') || t.includes('iteration')) return 're-prompt';
  return 'clean';
}
function flagTone(flag: PrInsightDTO['flag']): PrInsightDTO['flagTone'] {
  if (flag === 'clean') return 'ok';
  if (flag === 'revert' || flag === 'ai-slop') return 'bad';
  return 'warn';
}
function flagLabel(flag: PrInsightDTO['flag']): string {
  switch (flag) {
    case 'clean':
      return 'clean';
    case 're-prompt':
      return 're-prompt';
    case 'revert':
      return 'revert';
    case 'ai-slop':
      return 'ai-slop';
  }
}
function extractPrNumber(refs: string[] | null): string | null {
  if (!refs) return null;
  const hit = refs.find((r) => /#?\d+/.test(r));
  if (!hit) return null;
  const m = hit.match(/\d+/);
  return m ? `#${m[0]}` : null;
}
function inferSize(refs: string[] | null): PrInsightDTO['sizeBucket'] {
  if (!refs) return 'M';
  const joined = refs.join(' ');
  if (/\bL\b/.test(joined)) return 'L';
  if (/\bS\b/.test(joined)) return 'S';
  return 'M';
}

// ─────────────────────────────────────────────────────────────────────────────
// getRecommendations
// ─────────────────────────────────────────────────────────────────────────────

interface RecLite {
  ref: string;
  rationale: string | null;
  kind: string;
  status: string;
  date: string | null;
  created_at: string;
}

export async function getRecommendations(employeeId: string): Promise<RecommendationDTO[]> {
  const client = await db();
  // recommendations has no title/body/dimension columns: title = ref, body = rationale,
  // and the DTO tag is derived from the rec_kind (skill/process/course).
  const raw = (await selectRows(
    client
      .from('recommendations')
      .select('ref, rationale, kind, status, date, created_at, employee_id')
      .eq('employee_id', employeeId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false }) as DbReadFilter,
  )) as unknown as RecLite[];

  // Only OPEN recs are live nudges — adopted/dismissed are resolved and must not
  // reappear as suggestions (the adoption monitor advances them; the UI must respect it).
  return raw
    .filter((r) => r.status !== 'adopted' && r.status !== 'dismissed')
    .map((r) => {
      const kind = recKind(r.kind);
      return {
        title: r.ref,
        body: r.rationale ?? '',
        kind,
        tag: recTag(kind),
        marker: '✦',
      };
    });
}

/** rec_kind enum is already ('skill'|'process'|'course'); fall back to skill. */
function recKind(kind: string): RecommendationDTO['kind'] {
  if (kind === 'process') return 'process';
  if (kind === 'course') return 'course';
  return 'skill';
}

/** Tag derived from the rec kind (skill→prof, process→eff, course→prof). */
function recTag(kind: RecommendationDTO['kind']): DimensionTag {
  return kind === 'process' ? 'eff' : 'prof';
}

// ─────────────────────────────────────────────────────────────────────────────
// getCourse (assigned course card)
// ─────────────────────────────────────────────────────────────────────────────

interface CourseLite {
  course_id: string;
  title: string | null;
  url: string | null;
  progress_pct: number | null;
  status: string;
  knowledge_check_passed_at: string | null;
  created_at: string;
}

export async function getCourse(employeeId: string): Promise<CourseDTO | null> {
  const client = await db();
  // courses has no slug/assigned_at: identify by course_id, order by created_at.
  const row = (await selectOne(() =>
    client
      .from('courses')
      .select('course_id, title, url, progress_pct, status, knowledge_check_passed_at, created_at, employee_id')
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  )) as CourseLite | null;

  if (!row) return null;

  // Completion is Prism-owned: only a passed knowledge check (or status 'completed') counts.
  const kcPending = row.knowledge_check_passed_at === null;
  const progressPct = row.progress_pct ?? 0;

  return {
    title: row.title ?? row.course_id,
    url: row.url ?? courseUrl(row.course_id),
    progressPct,
    statusLabel: courseStatusLabel(progressPct, kcPending),
    knowledgeCheckPending: kcPending,
  };
}

function courseUrl(courseId: string): string {
  return `/me/courses/${encodeURIComponent(courseId)}`;
}
function courseStatusLabel(pct: number, kcPending: boolean): string {
  if (pct >= 100) return 'completed';
  const kc = kcPending ? ' · knowledge check pending' : '';
  return `${pct}%${kc}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// shared helpers
// ─────────────────────────────────────────────────────────────────────────────

async function employeeInsights(employeeId: string, kind: string): Promise<InsightLite[]> {
  const client = await db();
  const raw = await selectRows(
    client
      .from('insights')
      .select('title, body, dimension, kind, created_at, scope, scope_id, evidence_jsonb')
      .eq('scope', 'employee')
      .eq('scope_id', employeeId)
      .eq('kind', kind)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(12) as DbReadFilter,
  );
  return raw as unknown as InsightLite[];
}

function normalizeDimension(d: string | null): Dimension | null {
  if (d === 'usage' || d === 'efficiency' || d === 'effectiveness' || d === 'proficiency') return d;
  return null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return NO_SIGNAL;
  const mon = MONTHS[d.getUTCMonth()] ?? '';
  return `${mon} ${d.getUTCDate()}`;
}

// keep DimensionTag import meaningful for downstream type-checks
export type { DimensionTag };
