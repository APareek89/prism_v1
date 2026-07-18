import { createAdminClient } from '@/lib/supabase/admin';

type DbResult = Promise<{ data: unknown; error: { message?: string } | null }>;
interface DbChain extends DbResult {
  eq: (column: string, value: unknown) => DbChain;
  order: (column: string, options?: { ascending?: boolean }) => DbChain;
  limit: (count: number) => DbChain;
}
interface DbTable { select: (columns: string) => DbChain; }
interface LooseDb { from: (table: string) => DbTable; }

function db(): LooseDb { return createAdminClient() as unknown as LooseDb; }
function rows(result: { data: unknown; error: unknown }): Record<string, unknown>[] {
  if (result.error) {
    const message = typeof result.error === 'object' && result.error && 'message' in result.error
      ? String((result.error as { message?: unknown }).message ?? 'database query failed')
      : String(result.error);
    throw new Error(message);
  }
  return Array.isArray(result.data) ? result.data as Record<string, unknown>[] : [];
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function str(value: unknown): string { return typeof value === 'string' ? value : ''; }

export interface AgenticSubject { id: string; label: string; type: 'organization' | 'employee'; }
export interface AgenticArtifactSummary { key: string; type: 'insight' | 'recommendation'; kind: string; label: string; date: string; }
export interface AgenticArtifact extends AgenticArtifactSummary {
  traceVersion: string;
  ownership: string;
  candidate: Record<string, unknown>;
  output: Record<string, unknown>;
  confidence: Record<string, unknown>;
  evidence: unknown;
  validation: Record<string, unknown>;
  stages: Array<Record<string, unknown>>;
  legacy: boolean;
}
export interface AgenticFlowSnapshot {
  subjects: AgenticSubject[];
  subjectId: string;
  artifacts: AgenticArtifactSummary[];
  selected: AgenticArtifact | null;
}

export async function getAgenticFlowSnapshot(
  functionId: string,
  requestedSubject?: string,
  requestedArtifact?: string,
): Promise<AgenticFlowSnapshot> {
  const peopleResult = await db().from('employees').select('id,name,active,function_id').eq('function_id', functionId).eq('active', true).order('name', { ascending: true });
  const people = rows(peopleResult);
  const subjects: AgenticSubject[] = [
    { id: functionId, label: 'Organization aggregate', type: 'organization' },
    ...people.map((person) => ({ id: str(person.id), label: str(person.name) || 'Unnamed employee', type: 'employee' as const })),
  ];
  const subjectId = subjects.some((subject) => subject.id === requestedSubject)
    ? String(requestedSubject)
    : (subjects.find((subject) => subject.type === 'employee')?.id ?? functionId);
  const organization = subjectId === functionId;

  const insightQuery = db().from('insights')
    .select('id,date,kind,title,body,dimension,est_impact,evidence_jsonb,rank,created_at,scope,scope_id,function_id')
    .eq('function_id', functionId)
    .eq('scope', organization ? 'function' : 'employee')
    .eq('scope_id', subjectId)
    .order('date', { ascending: false })
    .order('rank', { ascending: true })
    .limit(50);
  const insightResult = await insightQuery;
  const recommendationResult = organization
    ? { data: [], error: null }
    : await db().from('recommendations')
      .select('id,date,kind,ref,rationale,status,detected_via,evidence_jsonb,created_at,employee_id,function_id')
      .eq('function_id', functionId)
      .eq('employee_id', subjectId)
      .order('date', { ascending: false })
      .limit(30);

  const source = [
    ...rows(insightResult).map((row) => normalizeInsight(row)),
    ...rows(recommendationResult).map((row) => normalizeRecommendation(row)),
  ].sort((a, b) => b.date.localeCompare(a.date) || a.label.localeCompare(b.label));
  const artifacts = source.map(({ key, type, kind, label, date }) => ({ key, type, kind, label, date }));
  const selected = source.find((artifact) => artifact.key === requestedArtifact) ?? source[0] ?? null;
  return { subjects, subjectId, artifacts, selected };
}

function normalizeInsight(row: Record<string, unknown>): AgenticArtifact {
  const evidenceJson = record(row.evidence_jsonb);
  const traceVersion = str(evidenceJson.traceVersion);
  const legacy = !traceVersion;
  const refs = Array.isArray(evidenceJson.refs) ? evidenceJson.refs : [];
  return {
    key: `insight:${str(row.id)}`,
    type: 'insight',
    kind: str(row.kind),
    label: str(row.title) || 'Untitled insight',
    date: str(row.date),
    traceVersion: traceVersion || 'legacy-insight',
    ownership: 'A bounded narrator writes prose over deterministic evidence. It cannot compute or change scores.',
    candidate: record(evidenceJson.candidate),
    output: Object.keys(record(evidenceJson.output)).length ? record(evidenceJson.output) : { observation: str(row.body) },
    confidence: record(evidenceJson.confidence),
    evidence: evidenceJson.evidence ?? refs,
    validation: record(evidenceJson.validation),
    stages: Array.isArray(evidenceJson.stages) ? evidenceJson.stages.map(record) : legacyStages('bounded_llm'),
    legacy,
  };
}

function normalizeRecommendation(row: Record<string, unknown>): AgenticArtifact {
  const evidenceJson = record(row.evidence_jsonb);
  const traceVersion = str(evidenceJson.traceVersion);
  const legacy = !traceVersion;
  return {
    key: `recommendation:${str(row.id)}`,
    type: 'recommendation',
    kind: str(row.kind),
    label: str(row.ref) || 'Recommendation',
    date: str(row.date),
    traceVersion: traceVersion || 'legacy-recommendation',
    ownership: str(evidenceJson.ownership) || 'Deterministic rule engine; no LLM selected or scored this recommendation.',
    candidate: Object.keys(record(evidenceJson.candidate)).length ? record(evidenceJson.candidate) : { rule: row.detected_via ?? null, status: row.status ?? null },
    output: Object.keys(record(evidenceJson.output)).length ? record(evidenceJson.output) : { observation: str(row.rationale) },
    confidence: {},
    evidence: evidenceJson.evidence ?? evidenceJson,
    validation: {},
    stages: Array.isArray(evidenceJson.stages) ? evidenceJson.stages.map(record) : legacyStages('deterministic_code'),
    legacy,
  };
}

function legacyStages(owner: string): Array<Record<string, unknown>> {
  return [
    { id: 'legacy_artifact', owner, status: 'accepted', detail: 'Created before versioned flow tracing was enabled; only persisted evidence is available.' },
  ];
}
