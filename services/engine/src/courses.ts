// Static course catalog for the Growth tab — deterministic, keyless. Courses
// map to the KPIs they lift; the UI renders CSS/SVG placeholder thumbnails
// (hue below), no external images. Completion is a real v3.user_context row.

import type { KpiId } from '@prism/contract';

export interface Course {
  id: string;
  title: string;
  minutes: number;
  level: 'intro' | 'core' | 'advanced';
  blurb: string;
  targets: KpiId[];
  hue: number;   // thumbnail gradient hue (0–360)
}

export const COURSE_CATALOG: Course[] = [
  {
    id: 'context-discipline', title: 'Context discipline: warm starts & CLAUDE.md',
    minutes: 25, level: 'core', hue: 210,
    blurb: 'Stop hand-carrying context. CLAUDE.md, handoff files, and continuation sessions — the habits behind cache-read >30%.',
    targets: ['continuity', 'tokens', 'iterations'],
  },
  {
    id: 'verification-harness', title: 'The verification harness: V1–V4 before every PR',
    minutes: 30, level: 'core', hue: 150,
    blurb: 'Build/tests/lint/runtime checks inside the session, with execution evidence. The single biggest revert-rate lever.',
    targets: ['verification', 'revert'],
  },
  {
    id: 'review-loop', title: 'The pre-PR review loop',
    minutes: 20, level: 'core', hue: 280,
    blurb: 'A critique pass before human review: real findings or an explicit all-clear. Cuts reviewer burden ~4×.',
    targets: ['review_loop', 'revert', 'rework'],
  },
  {
    id: 'prompt-frontload', title: 'Front-loading prompts: file + goal + acceptance',
    minutes: 15, level: 'intro', hue: 30,
    blurb: 'Sessions that start with file refs and acceptance criteria finish in a third of the turns. The C1 nudge, as a habit.',
    targets: ['iterations'],
  },
  {
    id: 'token-economy', title: 'Token economy: scope, cache, dead ends',
    minutes: 20, level: 'intro', hue: 350,
    blurb: 'Where tokens actually go — delivery vs exploration, cache re-feeding, marathon dead ends — and how to spend them on shipped work.',
    targets: ['tokens'],
  },
  {
    id: 'skills-authoring', title: 'Skills: turn know-how into assets',
    minutes: 25, level: 'advanced', hue: 90,
    blurb: 'Capture your repeated patterns as invocable skills with real execution evidence — and become the multiplier on your team.',
    targets: ['skills_authored', 'iterations'],
  },
  {
    id: 'ai-first-ticket', title: 'Your first end-to-end AI ticket',
    minutes: 20, level: 'intro', hue: 250,
    blurb: 'From ticket to merged PR inside one Claude Code session — repo setup, feature branch, pr-link marker, done.',
    targets: ['ai_share', 'cadence'],
  },
  {
    id: 'deploy-reliability', title: 'Change reliability: deploys that stick',
    minutes: 30, level: 'advanced', hue: 190,
    blurb: 'The T1 evidence ladder — rollbacks, hotfix windows, batch blur — and what "failed for the end user" really means.',
    targets: ['revert', 'rework'],
  },
];

export const coursesForKpis = (kpiIds: KpiId[]): Course[] =>
  COURSE_CATALOG.filter((c) => c.targets.some((t) => kpiIds.includes(t)));
