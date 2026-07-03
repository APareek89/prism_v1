// lib/v3/agents/facts.ts
//
// The ASSEMBLE step (v1 lib/agents/assemble.ts pattern): deterministically gather
// everything the coaching agent is allowed to know about ONE developer — their
// engine-computed KPIs + evidence meta, both indexes, confirmed engine findings,
// coaching outcomes (what they acted on vs ignored), what they ALREADY adopted
// (v3.user_context — the "inputs of the user"), the org's invocable skills, repo
// flags, and the course catalog. Renders one FACTS text block; the grounding gate
// later only accepts numbers that appear in this block. No LLM here.

import { COURSE_CATALOG, type Course } from '@prism/engine';
import type { DeveloperRow } from '@prism/contract';
import { extractNumbers } from '@/lib/agents/grounding';
import { v3db } from '../db';
import {
  coachingEventsFor, developerDetail, userContextFor, type ActivePin,
} from '../read';

export interface AgentFacts {
  dev: DeveloperRow;
  factsText: string;
  allowedNumbers: Set<string>;
  kpiIds: Set<string>;
  courseIds: Set<string>;
  skillNames: Set<string>;
  weakKpis: string[];     // score < 60, ascending
  strongKpis: string[];   // score ≥ 80, descending
  catalog: Course[];
}

/** Meta keys worth showing the agent, per KPI (kept compact — prompt budget). */
const META_KEYS: Record<string, string[]> = {
  ai_share: ['ai_prs', 'merged_prs', 'link_methods'],
  cadence: ['session_days', 'working_days', 'max_gap_days'],
  iterations: ['exact_links_only'],
  tokens: ['in_scope_k', 'exploration_k', 'cache_read_share'],
  revert: ['reverted'],
  rework: ['pairs', 'excluded_wip'],
  reliability: ['ai_deploys', 'failures'],
  skills_authored: ['authored', 'real'],
  verification: ['verified', 'ai_prs', 'breadth_pct'],
  review_loop: ['looped', 'theater_passes'],
  continuity: ['warm', 'sessions', 'avg_cold_first_prompt_chars'],
};

export async function assembleFacts(devId: string, pin: ActivePin): Promise<AgentFacts | null> {
  const detail = await developerDetail(devId, pin);
  if (!detail || pin.date === null) return null;
  const [coaching, adopted, orgSkills, repos] = await Promise.all([
    coachingEventsFor(devId),
    userContextFor(devId),
    v3db().query(
      `select s.name, d.handle as owner,
         exists (select 1 from v3.sessions x where x.developer_id = $1
                 and x.skill_invocations @> ('[{"name":"' || s.name || '"}]')::jsonb) as used_by_me
       from v3.skills s join v3.developers d on d.id = s.developer_id order by s.name`,
      [devId],
    ),
    v3db().query('select * from v3.repos where connected order by repo'),
  ]);

  const lines: string[] = [];
  const push = (s: string) => lines.push(s);

  push(`DEVELOPER: ${detail.dev.name} (@${detail.dev.handle}) · archetype ${detail.dev.archetype} · team ${detail.dev.team} · seat ${detail.dev.seat_tier}`);
  push(`WINDOW: trailing 28 days as-of ${pin.date} · config v${pin.version}`);

  push(`\nINDEXES:`);
  const m = detail.main;
  push(`- main index: ${m?.score ?? 'suppressed'} /100 · band ${m?.band ?? '—'} · confidence ${m?.confidence ?? '—'}` +
    `${m?.gates.l0_forced ? ' · L0-GATED (AI share < 15)' : ''}${m?.gates.l5_capped ? ' · L5-capped (no multiplier)' : ''}` +
    `${(m?.gates.multiplier_signal ?? 0) > 0 ? ` · multiplier x${m!.gates.multiplier_signal}` : ''}`);
  push(`- dimensions: usage ${m?.dimensions?.usage ?? '—'} · efficiency ${m?.dimensions?.efficiency ?? '—'} · outcomes ${m?.dimensions?.outcomes ?? '—'}`);
  push(`- harness index: ${detail.harness?.score ?? 'suppressed'} /100 · confidence ${detail.harness?.confidence ?? '—'}`);

  push(`\nKPIS (id · raw · score/100 · n · evidence):`);
  for (const k of detail.kpis) {
    const meta = META_KEYS[k.kpi_id]
      ?.map((key) => (k.meta[key] !== undefined ? `${key}=${JSON.stringify(k.meta[key])}` : null))
      .filter(Boolean)
      .join(' ');
    push(`- ${k.kpi_id}: raw ${k.raw_value ?? 'null'} · score ${k.score ?? 'null'} · n=${k.signal_count}` +
      `${k.tier ? ` · tier ${k.tier}` : ''}${meta ? ` · ${meta}` : ''}`);
  }

  if (detail.insights.length) {
    push(`\nCONFIRMED ENGINE FINDINGS (deterministic — hypothesis-tested):`);
    for (const i of detail.insights) push(`- [${i.kpi_id}/${i.hypothesis}] ${i.title}: ${i.body}`);
  }

  if (coaching.length) {
    const byRule = new Map<string, { fired: number; acted: number; ignored: number; dismissed: number; example: string }>();
    for (const e of coaching) {
      const r = byRule.get(e.rule_id) ?? { fired: 0, acted: 0, ignored: 0, dismissed: 0, example: e.message };
      r.fired++;
      if (e.outcome === 'acted') r.acted++;
      else if (e.outcome === 'ignored') r.ignored++;
      else r.dismissed++;
      byRule.set(e.rule_id, r);
    }
    push(`\nIN-FLOW COACHING (rule · fired · acted/ignored/dismissed · example):`);
    for (const [rule, r] of byRule) {
      push(`- ${rule}: fired ${r.fired} · acted ${r.acted} / ignored ${r.ignored} / dismissed ${r.dismissed} · e.g. "${r.example}"`);
    }
  }

  push(`\nALREADY ADOPTED BY THE USER (do NOT recommend these again — build on them):`);
  if (adopted.length === 0) push(`- nothing yet`);
  for (const u of adopted) push(`- ${u.kind}: ${u.ref}`);

  push(`\nORG SKILLS AVAILABLE TO INVOKE (name · author · used by this developer?):`);
  for (const s of orgSkills.rows as Array<{ name: string; owner: string; used_by_me: boolean }>) {
    push(`- ${s.name} (by @${s.owner}) · used by me: ${s.used_by_me ? 'yes' : 'NO'}`);
  }

  push(`\nCONNECTED REPOS (flags):`);
  for (const r of repos.rows as Array<{ repo: string; has_tests: boolean; has_claude_md: boolean; verify_rule_in_claude_md: boolean }>) {
    push(`- ${r.repo}: tests=${r.has_tests} claude_md=${r.has_claude_md} verify_rule=${r.verify_rule_in_claude_md}`);
  }

  push(`\nCOURSE CATALOG (id · title · minutes · lifts KPIs · blurb):`);
  for (const c of COURSE_CATALOG) {
    push(`- ${c.id}: "${c.title}" · ${c.minutes} min · lifts ${c.targets.join(', ')} · ${c.blurb}`);
  }

  const factsText = lines.join('\n');
  const scored = detail.kpis.filter((k) => k.score !== null);
  return {
    dev: detail.dev,
    factsText,
    allowedNumbers: new Set(extractNumbers(factsText)),
    kpiIds: new Set(detail.kpis.map((k) => k.kpi_id as string)),
    courseIds: new Set(COURSE_CATALOG.map((c) => c.id)),
    skillNames: new Set((orgSkills.rows as Array<{ name: string }>).map((s) => s.name)),
    weakKpis: scored.filter((k) => k.score! < 60).sort((a, b) => a.score! - b.score!).map((k) => k.kpi_id as string),
    strongKpis: scored.filter((k) => k.score! >= 80).sort((a, b) => b.score! - a.score!).map((k) => k.kpi_id as string),
    catalog: [...COURSE_CATALOG],
  };
}
