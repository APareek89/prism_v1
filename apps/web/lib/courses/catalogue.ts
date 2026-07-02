// lib/courses/catalogue.ts
//
// The weak-dimension → micro-course map. Each of the four scoring dimensions
// (usage · efficiency · effectiveness · proficiency) maps to ONE Agentic
// Learning Studio (ALS) course slug — the `course_id` we persist and the value
// we hand to the studio's `/api/course/:courseId` to resolve its lessons.
//
// LANDMINE (M2 finding): the studio has NO catalogue endpoint that Prism can
// enumerate at build time, and course generation is a learner-initiated,
// human-in-the-loop flow (POST /api/overview → /api/build). So Prism cannot
// "look up" whether an arbitrary slug exists without a round trip. This module
// is therefore a STATIC, curated map — the single source of truth for which
// course we assign per weak dimension. If a dimension has no curated slug we
// return `null`, and the assigner records the assignment as `unavailable`
// (in memory) rather than fabricating a link (HARD RULE: no dummy data).
//
// The slugs below are Prism-side catalogue identifiers. They double as the ALS
// `course_id` we pass to `/api/course/:courseId`; when the studio is configured
// and the slug resolves, client.ts turns the kick-off lesson into a hosted URL.
// When the studio is blank OR the slug does not resolve, the course still exists
// as an assignment (dimension + title) but with a null URL — it degrades
// gracefully, it never invents one.

import type { Dimension } from '@/lib/ui/view-models';

// ─────────────────────────────────────────────────────────────────────────────
// Catalogue entry
// ─────────────────────────────────────────────────────────────────────────────

export interface CatalogueEntry {
  /** The ALS course slug — persisted as courses.course_id and used with /api/course/:courseId. */
  courseId: string;
  /** Human title stored on the courses row (courses.title). */
  title: string;
  /** The dimension this course strengthens (courses.dimension). */
  dimension: Dimension;
}

// ─────────────────────────────────────────────────────────────────────────────
// The curated map. One course per dimension. Keep slugs stable — they are the
// join key to ALS lessons; renaming a slug orphans in-flight assignments.
//
// ASSUMPTION (ALS repo is ambiguous here): there is no published, machine-readable
// course catalogue in the studio. These slugs are the agreed Prism↔ALS contract
// for the four coaching tracks. If ALS later ships a real catalogue API, replace
// this constant with a resolver — the rest of A4 depends only on
// `catalogueFor(dimension)` returning `{ courseId, title } | null`.
// ─────────────────────────────────────────────────────────────────────────────

const CATALOGUE: Record<Dimension, CatalogueEntry | null> = {
  usage: {
    courseId: 'ai-adoption-fundamentals',
    title: 'Getting the most from AI-assisted development',
    dimension: 'usage',
  },
  efficiency: {
    courseId: 'prompting-for-efficiency',
    title: 'Prompting for efficiency: fewer tokens, fewer iterations',
    dimension: 'efficiency',
  },
  effectiveness: {
    courseId: 'shipping-clean-ai-code',
    title: 'Shipping clean AI code: avoiding reverts and slop',
    dimension: 'effectiveness',
  },
  proficiency: {
    courseId: 'advanced-agentic-workflows',
    title: 'Advanced agentic workflows and tool mastery',
    dimension: 'proficiency',
  },
};

/**
 * Resolve the catalogue course for a dimension. Returns `null` when no course is
 * curated for that dimension — the caller must treat that as "unavailable" and
 * must NOT assign a fabricated course/link.
 */
export function catalogueFor(dimension: Dimension): CatalogueEntry | null {
  return CATALOGUE[dimension] ?? null;
}

/** All curated entries (for tests / admin listing). Never includes null slots. */
export function catalogueEntries(): CatalogueEntry[] {
  return (Object.values(CATALOGUE).filter(Boolean) as CatalogueEntry[]);
}
