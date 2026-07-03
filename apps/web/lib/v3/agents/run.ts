// lib/v3/agents/run.ts
//
// The agentic flow: assemble facts → three structured LLM calls (good/bad ·
// course picks · suggestions) → grounding gate (numbers must exist in the FACTS
// block; ONE repair retry, then drop) → code-level ref validation (course ids ∈
// catalog, KPI ids ∈ catalog, skill refs ∈ org skills — stronger than trusting
// citations) → persist to v3.agent_artifacts pinned to (date, config_version).
//
// Boundary: the engine's numbers are already computed and immutable here — the
// agent only interprets. No score, weight, or rank is ever written by this file.

import type { AgentArtifactRow } from '@prism/contract';
import { buildAllowedNumbers, checkGrounding, repairNote } from '@/lib/agents/grounding';
import { v3db } from '../db';
import type { ActivePin } from '../read';
import { assembleFacts, type AgentFacts } from './facts';
import { agentModelId, agentUsesRealModel, invokeStructured } from './model';
import { mockCoursePicks, mockGoodBad, mockSuggestions } from './mock';
import {
  COURSE_PICKS_JSON, CoursePicksSchema, GOOD_BAD_JSON, GoodBadSchema,
  SUGGESTIONS_JSON, SuggestionsSchema,
  type CoursePicks, type GoodBad, type Suggestions,
} from './schemas';

const SYSTEM = `You are Prism's coaching agent for ONE software engineer. Prism measures how well
engineers work with AI coding agents (Claude Code). You are given a FACTS block: their
deterministic KPI scores, both indexes, confirmed engine findings, in-flow coaching outcomes,
what they already adopted, the org's invocable skills, repo flags, and the course catalog.

Style: titles ≤ 15 words; bodies 1–3 sentences (≤ ~350 characters).

Rules — non-negotiable:
- Ground EVERYTHING in the FACTS block. You may ONLY quote numbers that literally appear there.
  Never invent, estimate, or arithmetic-derive a figure.
- Speak to the engineer directly ("your"), specific and kind — coaching, not judgment.
- Do not recommend anything listed under ALREADY ADOPTED; build on it instead.
- Prefer the mechanism over the symptom (the engine findings name mechanisms — use them).`;

type ArtifactInsert = Omit<AgentArtifactRow, 'id' | 'created_at' | 'developer_id' | 'date' | 'config_version'>;

export interface AgentRunSummary {
  developerId: string;
  model: string;
  counts: { good: number; bad: number; course: number; suggestion: number };
  dropped: number;
}

export async function runAgentFor(devId: string, pin: ActivePin): Promise<AgentRunSummary> {
  const facts = await assembleFacts(devId, pin);
  if (!facts || pin.date === null) throw new Error('no computed data for this developer — run v3:recompute first');

  const real = agentUsesRealModel();
  const model = real ? agentModelId() : 'mock';
  const allowed = buildAllowedNumbers([], []);
  for (const n of facts.allowedNumbers) allowed.add(n);
  let dropped = 0;

  // Grounded structured call with ONE repair retry (v1 node policy).
  async function grounded<T>(
    name: string,
    schema: Parameters<typeof invokeStructured>[0],
    jsonSchema: Record<string, unknown>,
    user: string,
    mock: () => T,
    proseOf: (out: T) => string[][],
  ): Promise<T | null> {
    if (!real) return mock();
    let out = (await invokeStructured(schema, jsonSchema, name, SYSTEM, user)) as T;
    const violations = proseOf(out).flatMap((p) => checkGrounding(p, [], allowed, new Set()).violations);
    if (violations.length === 0) return out;
    out = (await invokeStructured(schema, jsonSchema, name, SYSTEM, `${user}\n\n${repairNote(violations)}`)) as T;
    const still = proseOf(out).flatMap((p) => checkGrounding(p, [], allowed, new Set()).violations);
    if (still.length === 0) return out;
    dropped++;
    return null;   // drop the whole group rather than persist ungrounded prose
  }

  const factsBlock = `FACTS:\n${facts.factsText}`;

  const [goodBad, picks, suggestions] = await Promise.all([
    grounded<GoodBad>(
      'good_bad_insights', GoodBadSchema, GOOD_BAD_JSON,
      `${factsBlock}\n\nTASK: What is going WELL and what is going BADLY for this engineer? 1–4 items each. kpiRefs = the KPI ids each item rests on.`,
      () => mockGoodBad(facts),
      (o) => [...o.good.map((i) => [i.title, i.body]), ...o.bad.map((i) => [i.title, i.body])],
    ),
    grounded<CoursePicks>(
      'course_picks', CoursePicksSchema, COURSE_PICKS_JSON,
      `${factsBlock}\n\nTASK: Pick 1–3 courses from the COURSE CATALOG for THIS engineer. courseId must be a catalog id. The reason must be personal (their numbers/findings), not generic.`,
      () => mockCoursePicks(facts),
      (o) => o.picks.map((p) => [p.reason]),
    ),
    grounded<Suggestions>(
      'practice_suggestions', SuggestionsSchema, SUGGESTIONS_JSON,
      `${factsBlock}\n\nTASK: 2–5 concrete practice suggestions (imperative titles). Think: invoke a specific org skill · verification before PR · prompt structure · context files · process. ref = a skill name or course id from FACTS when one applies.`,
      () => mockSuggestions(facts),
      (o) => o.suggestions.map((s) => [s.title, s.body]),
    ),
  ]);

  // Code-level ref validation — stronger than trusting model citations.
  const validKpi = (ids: string[]) => ids.filter((k) => facts.kpiIds.has(k));
  const artifacts: ArtifactInsert[] = [];
  if (goodBad) {
    for (const i of goodBad.good) artifacts.push({ kind: 'good', ref: null, title: i.title, body: i.body, category: null, targets: validKpi(i.kpiRefs), model, grounded: true, meta: {} });
    for (const i of goodBad.bad) artifacts.push({ kind: 'bad', ref: null, title: i.title, body: i.body, category: null, targets: validKpi(i.kpiRefs), model, grounded: true, meta: {} });
  }
  if (picks) {
    for (const p of picks.picks) {
      if (!facts.courseIds.has(p.courseId)) { dropped++; continue; }   // hallucinated course id
      const course = facts.catalog.find((c) => c.id === p.courseId)!;
      artifacts.push({ kind: 'course', ref: p.courseId, title: course.title, body: p.reason, category: null, targets: [...course.targets], model, grounded: true, meta: { minutes: course.minutes, level: course.level } });
    }
  }
  if (suggestions) {
    for (const s of suggestions.suggestions) {
      const ref = s.ref && (facts.skillNames.has(s.ref) || facts.courseIds.has(s.ref)) ? s.ref : null;
      artifacts.push({ kind: 'suggestion', ref, title: s.title, body: s.body, category: s.category, targets: validKpi(s.targets), model, grounded: true, meta: {} });
    }
  }

  // Persist: replace this developer's slice for the pin (idempotent regenerate).
  const db = v3db();
  const client = await db.connect();
  try {
    await client.query('begin');
    await client.query(
      'delete from v3.agent_artifacts where developer_id = $1 and date = $2 and config_version = $3',
      [devId, pin.date, pin.version],
    );
    for (const a of artifacts) {
      await client.query(
        `insert into v3.agent_artifacts
           (developer_id, date, config_version, kind, ref, title, body, category, targets, model, grounded, meta)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         on conflict (developer_id, date, config_version, kind, title) do update
           set body = excluded.body, ref = excluded.ref, category = excluded.category,
               targets = excluded.targets, model = excluded.model, meta = excluded.meta`,
        [devId, pin.date, pin.version, a.kind, a.ref, a.title, a.body, a.category, a.targets, a.model, a.grounded, JSON.stringify(a.meta)],
      );
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  return {
    developerId: devId,
    model,
    counts: {
      good: artifacts.filter((a) => a.kind === 'good').length,
      bad: artifacts.filter((a) => a.kind === 'bad').length,
      course: artifacts.filter((a) => a.kind === 'course').length,
      suggestion: artifacts.filter((a) => a.kind === 'suggestion').length,
    },
    dropped,
  };
}
