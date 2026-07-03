// lib/v3/agents/mock.ts
//
// Deterministic keyless fallback (v1 mock-model.ts pattern): schema-valid
// artifacts derived from the facts by simple rules, so the whole agentic flow
// runs offline/$0 and tests are reproducible. Marked model='mock' in the UI.

import type { AgentFacts } from './facts';
import type { CoursePicks, GoodBad, Suggestions } from './schemas';

const KPI_LABEL: Record<string, string> = {
  ai_share: 'AI-assisted PR share', cadence: 'session cadence', iterations: 'iterations to merge',
  tokens: 'tokens to shipped', revert: 'merged-without-revert', rework: 'defect-rework rate',
  reliability: 'change reliability', skills_authored: 'skills authored', verification: 'verification harness',
  review_loop: 'review loop', continuity: 'context continuity',
};

export function mockGoodBad(f: AgentFacts): GoodBad {
  const good = f.strongKpis.slice(0, 2).map((k) => ({
    title: `Strong ${KPI_LABEL[k] ?? k}`,
    body: `Your ${KPI_LABEL[k] ?? k} sits comfortably above target this window — keep the habit that produces it; it carries your index.`,
    kpiRefs: [k],
  }));
  const bad = f.weakKpis.slice(0, 2).map((k) => ({
    title: `${KPI_LABEL[k] ?? k} is dragging your index`,
    body: `Your ${KPI_LABEL[k] ?? k} is the weakest signal this window. The engine's confirmed findings above name the mechanism — start there.`,
    kpiRefs: [k],
  }));
  return {
    good: good.length ? good : [{ title: 'Consistent shipping', body: 'Merged work keeps flowing through the window with no measurement gaps — the pipeline sees you clearly.', kpiRefs: [] }],
    bad: bad.length ? bad : [{ title: 'No weak signal stands out', body: 'Nothing scored below target this window; the next lever is deepening the harness practices.', kpiRefs: [] }],
  };
}

export function mockCoursePicks(f: AgentFacts): CoursePicks {
  const picks = f.catalog
    .filter((c) => c.targets.some((t) => f.weakKpis.includes(t)))
    .slice(0, 2)
    .map((c) => ({
      courseId: c.id,
      reason: `Targets ${c.targets.filter((t) => f.weakKpis.includes(t)).map((t) => KPI_LABEL[t] ?? t).join(' and ')} — your weakest signals this window.`,
    }));
  return { picks: picks.length ? picks : [{ courseId: f.catalog[0]!.id, reason: 'A solid foundation course while every KPI sits at or near target.' }] };
}

export function mockSuggestions(f: AgentFacts): Suggestions {
  const s: Suggestions['suggestions'] = [];
  const unused = [...f.skillNames][0];
  if (f.weakKpis.includes('verification') || f.weakKpis.includes('revert')) {
    s.push({
      title: 'Run the test suite inside the session before opening a PR',
      body: 'Unverified AI PRs are the ones that get reverted. Make the agent run the harness (build + tests) and show you the exit codes before you open the PR.',
      category: 'verification', targets: ['verification', 'revert'],
    });
  }
  if (f.weakKpis.includes('continuity') || f.weakKpis.includes('tokens')) {
    s.push({
      title: 'Start sessions warm: read CLAUDE.md / the handoff first',
      body: 'Cold starts re-derive context and burn tokens. Keep durable context in files and have every session read them at start instead of hand-pasting.',
      category: 'context', targets: ['continuity', 'tokens'],
    });
  }
  if (f.weakKpis.includes('iterations')) {
    s.push({
      title: 'Front-load the first prompt: file, goal, acceptance criteria',
      body: 'Sessions that open with the target file and a done-definition finish in far fewer turns than exploratory openings.',
      category: 'prompt', targets: ['iterations'],
    });
  }
  if (unused) {
    s.push({
      title: `Invoke the org skill "${unused}" where it applies`,
      body: 'A squad skill already encodes this workflow — invoking it replaces repeated manual instruction and counts toward your harness.',
      category: 'skill', ref: unused, targets: ['skills_authored', 'iterations'],
    });
  }
  while (s.length < 2) {
    s.push({
      title: 'Keep the pre-PR review loop as a default',
      body: 'A critique pass before human review catches findings while they are still edits, not defect-rework.',
      category: 'process', targets: ['review_loop', 'rework'],
    });
  }
  return { suggestions: s.slice(0, 5) };
}
