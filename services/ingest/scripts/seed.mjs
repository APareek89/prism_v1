#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// v3 PREVIEW SEED — deterministic dummy data for the v3.0 model preview.
//
//   npm run v3:seed   (root)
//
// THIS FILE DOUBLES AS THE INGESTION SPEC. Each section states which raw table
// it fills, the real source/method/phase from docs/scoring-model.md §11, and
// the natural key used for the idempotent upsert. A real connector replaces a
// section here 1:1 — same table, same columns, same upsert key, same rule:
// RAW ROWS ONLY (the engine computes links/KPIs/indexes/insights), and
// NULLS STAY NULLS (never write a guessed value).
//
// DETERMINISM: fixed reference date (2026-07-01) + seeded PRNG (mulberry32) —
// re-running produces byte-identical rows; upserts make it idempotent.
// SCOPE: schema `v3` only. public.* is never touched (see CLAUDE.md exception).
//
// THE 10 ARCHETYPES (what each one demonstrates):
//   asha   star_with_harness    — high everything; skills used by others → L5-gate pass
//   marco  no_harness_shipper   — ships fast with AI, no harness → reverts (linkage demo)
//   jin    cold_starter         — AI share 11% < 15% → L0 gate forces Dormant
//   sofia  greenfield_only      — AI only in src/new-service, never legacy (1-H2)
//   ravi   over_generator       — 90k tokens/PR in-scope + big out-of-scope exploration (6-H0/H1/H4)
//   lena   burst_user           — feature-week bursts, maintenance-week silence (3-H1)
//   tom    context_hand_carrier — 1,800-char cold starts, 8% cache-read (15-H0, 6-H2) · default "self"
//   nadia  quota_capped         — sessions stop mid-week on a capped seat (3-H3, org channel)
//   diego  review_skipper       — zero review loops; other-caught reverts → review-gate (team)
//   emma   steady_median        — the L3 baseline; invokes asha's skill (multiplier signal)
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';
import pg from 'pg';

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error('✗ SUPABASE_DB_URL is not set (run via npm run v3:seed at the repo root).');
  process.exit(1);
}

// ── Deterministic helpers ────────────────────────────────────────────────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0xc0ffee);
const jitter = (base, spread) => base + Math.floor(rng() * (2 * spread + 1)) - spread;

const uuid = (key) => {
  const h = createHash('sha1').update(`prism-v3:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const sha = (key) => createHash('sha1').update(`prism-v3-sha:${key}`).digest('hex');

// Window: 28 days, day 0 = 2026-06-04 … day 27 = 2026-07-01 (the fixed REF date).
const day = (i, h = 10, m = 0) => new Date(Date.UTC(2026, 5, 4 + i, h, m)).toISOString();
// Weekday day-indexes inside the window (devs work weekdays; weekend work would
// count too — accepted + stated in the spec, just unused by the seed).
const WEEKDAYS = [0, 1, 4, 5, 6, 7, 8, 11, 12, 13, 14, 15, 18, 19, 20, 21, 22, 25, 26, 27];

// ── v3.repos — connected-scope + applicability map ──────────────────────────
// Source: GitHub App install + repo scan (P2). Natural key: repo.
// acme/labs is NOT connected: its sessions are visible exploration, never scored
// (KPI 6 scope rule). platform has the verify-before-PR rule in CLAUDE.md,
// checkout does not — powering the 13-H2 contrast.
const REPOS = [
  { repo: 'acme/checkout', connected: true, has_build: true, has_tests: true, has_lint: true, has_claude_md: false, verify_rule_in_claude_md: false },
  { repo: 'acme/platform', connected: true, has_build: true, has_tests: true, has_lint: true, has_claude_md: true, verify_rule_in_claude_md: true },
  { repo: 'acme/labs', connected: false, has_build: true, has_tests: false, has_lint: false, has_claude_md: false, verify_rule_in_claude_md: false },
];

// ── v3.developers — the 10 archetypes ────────────────────────────────────────
// Source: SSO/roster identity map (P4). Natural key: handle.
// Per-dev generation parameters (all literals — the seed's "story dials"):
//   sessionDays  days with ≥1 session (cadence numerator)
//   extraPrDays  non-session days that still get activity (cadence denominator)
//   aiPlan       link method per AI PR — pr_link | branch | sha | coauthor
//   turns        avg session turns on delivery sessions (KPI 4)
//   inScopeK     total in-scope session tokens (k) across the window (KPI 6)
//   cacheShare   cache-read share of input-side tokens (6-H2 signal)
//   warmShare    share of sessions reading context at start (KPI 15)
//   verifShare   share of delivery sessions with verification events (KPI 13)
//   verifCats    categories used when verifying (breadth)
//   reviewPlan   per-AI-PR review pass: real | nofind | theater | null (KPI 14)
//   coldChars    first-prompt length on cold starts (15-H0 — length flag only)
const DEVS = [
  {
    handle: 'asha', name: 'Asha Rao', archetype: 'star_with_harness', repo: 'acme/platform', team: 'Platform', seat: 'standard',
    sessionDays: [0, 1, 5, 6, 7, 8, 11, 12, 13, 14, 15, 18, 19, 20, 21, 22, 26, 27], extraPrDays: [4, 25],
    prCount: 12, aiPlan: Array(11).fill('pr_link'), modules: () => 'src/api',
    turns: 3, inScopeK: 320, cacheShare: 0.4, warmShare: 0.9, verifShare: 0.9,
    verifCats: ['V1', 'V2', 'V3', 'V4'], reviewPlan: ['real', 'real', 'real', 'nofind', 'real', 'real', 'real', 'real', 'real', null, 'real'],
    coldChars: 420, skills: ['api-client', 'pr-review', 'db-migration', 'release-notes'],
    reverted: [], rework: [],
  },
  {
    handle: 'marco', name: 'Marco Silva', archetype: 'no_harness_shipper', repo: 'acme/checkout', team: 'Checkout', seat: 'standard',
    sessionDays: [0, 1, 4, 5, 6, 7, 8, 11, 12, 13, 14, 18, 19, 20], extraPrDays: [15, 21, 22, 25, 26, 27],
    prCount: 10, aiPlan: Array(8).fill('pr_link'), modules: () => 'src/cart',
    turns: 6, inScopeK: 450, cacheShare: 0.15, warmShare: 0.4, verifShare: 0.125,
    verifCats: ['V2'], reviewPlan: Array(8).fill(null),
    coldChars: 700, skills: [],
    // 3 of 8 AI PRs reverted ≤14d — 1 self-caught (→ verification coaching),
    // 2 other-caught (→ review-gate). ALL count in the rate (v2.2 decision).
    reverted: [{ ai: 1, after: 3, by: 'self' }, { ai: 3, after: 2, by: 'tom' }, { ai: 5, after: 4, by: 'diego' }],
    rework: [{ pr: 0, tier: 'fix_type', after: 3 }, { pr: 6, tier: 'fix_type', after: 5 }],
  },
  {
    handle: 'jin', name: 'Jin Park', archetype: 'cold_starter', repo: 'acme/checkout', team: 'Checkout', seat: 'standard',
    sessionDays: [5, 12, 19], extraPrDays: [0, 1, 4, 7, 11, 14, 18, 21, 25, 26],
    prCount: 9, aiPlan: ['coauthor'], modules: () => 'src/orders',
    turns: 8, inScopeK: 60, cacheShare: 0.1, warmShare: 0.25, verifShare: 0,
    verifCats: [], reviewPlan: [null],
    coldChars: 900, skills: [],
    reverted: [], rework: [{ pr: 4, tier: 'pattern', after: 4 }],
  },
  {
    handle: 'sofia', name: 'Sofia Marino', archetype: 'greenfield_only', repo: 'acme/checkout', team: 'Checkout', seat: 'standard',
    sessionDays: [0, 4, 5, 7, 8, 12, 13, 18, 20, 21, 26], extraPrDays: [1, 6, 11, 14, 15, 19, 22, 25, 27],
    // 5 AI PRs, ALL in src/new-service (1-H2 selective use); 2 opened from the
    // browser → no pr-link marker → they fall to the branch method (0.80).
    prCount: 11, aiPlan: ['pr_link', 'branch', 'pr_link', 'branch', 'pr_link'],
    modules: (i, isAi) => (isAi ? 'src/new-service' : 'src/legacy'),
    turns: 4, inScopeK: 385, cacheShare: 0.28, warmShare: 0.6, verifShare: 0.6,
    verifCats: ['V2', 'V4'], reviewPlan: ['real', null, 'nofind', null, null],
    coldChars: 800, skills: ['checkout-fixtures'],
    reverted: [], rework: [{ pr: 7, tier: 'pattern', after: 6 }],
  },
  {
    handle: 'ravi', name: 'Ravi Iyer', archetype: 'over_generator', repo: 'acme/checkout', team: 'Checkout', seat: 'standard',
    sessionDays: [0, 1, 4, 5, 6, 8, 11, 12, 13, 15, 18, 19, 22], extraPrDays: [7, 14, 20, 25],
    prCount: 8, aiPlan: Array(6).fill('pr_link'), modules: () => 'src/payments',
    turns: 10, inScopeK: 720, cacheShare: 0.08, warmShare: 0.25, verifShare: 0.33,
    verifCats: ['V1'], reviewPlan: [null, 'real', null, null, null, null],
    coldChars: 1400, skills: ['payments-mock'],
    // Out-of-scope exploration in acme/labs: 600k tokens over 6 sessions —
    // VISIBLE in the exploration split (6-H1), never scored. Plus two in-scope
    // dead-end sessions (120k each, never linked) → the 6-H4 signal.
    labsSessions: { days: [1, 6, 13, 15, 19, 22], tokensK: 600 },
    deadEnds: [{ d: 11, tokensK: 120 }, { d: 18, tokensK: 120 }],
    reverted: [{ ai: 2, after: 5, by: 'sofia' }],
    rework: [{ pr: 3, tier: 'fix_type', after: 4 }],
  },
  {
    handle: 'lena', name: 'Lena Weber', archetype: 'burst_user', repo: 'acme/platform', team: 'Platform', seat: 'standard',
    // Two feature-week bursts, silence in between (3-H1 habit-not-formed).
    sessionDays: [0, 1, 4, 5, 6, 18, 19], extraPrDays: [7, 8, 11, 12, 13, 14, 15, 20, 21, 22, 25, 26],
    prCount: 9, aiPlan: Array(5).fill('pr_link'), modules: () => 'src/notifications',
    turns: 5, inScopeK: 360, cacheShare: 0.22, warmShare: 0.45, verifShare: 0.4,
    verifCats: ['V2'], reviewPlan: [null, 'theater', null, 'real', null],
    coldChars: 950, skills: [],
    reverted: [{ ai: 2, after: 3, by: 'emma' }],
    rework: [{ pr: 1, tier: 'issue_link', after: 5 }, { pr: 6, tier: 'fix_type', after: 4 }],
  },
  {
    handle: 'tom', name: 'Tom Becker', archetype: 'context_hand_carrier', repo: 'acme/checkout', team: 'Checkout', seat: 'standard',
    // THE DEFAULT "SELF" DEV in My View. Cold starts with 1,800-char first
    // prompts (15-H0), 8% cache-read (6-H2), no durable context files.
    sessionDays: [0, 1, 4, 5, 7, 8, 11, 13, 14, 19, 21, 26], extraPrDays: [6, 12, 15, 18, 20, 22, 25, 27],
    prCount: 10, aiPlan: Array(7).fill('pr_link'), modules: () => 'src/checkout-flow',
    turns: 8, inScopeK: 550, cacheShare: 0.08, warmShare: 0.12, verifShare: 0.43,
    verifCats: ['V2', 'V4'], reviewPlan: [null, 'real', null, 'nofind', null, null, null],
    coldChars: 1800, skills: [],
    reverted: [{ ai: 4, after: 2, by: 'self' }],
    rework: [{ pr: 2, tier: 'fix_type', after: 3 }, { pr: 8, tier: 'pattern', after: 6 }],
  },
  {
    handle: 'nadia', name: 'Nadia Hassan', archetype: 'quota_capped', repo: 'acme/platform', team: 'Platform', seat: 'capped',
    // Sessions ONLY Mon–Wed (days 4/5/6, 11/12, 18/19, 25/26) — the seat cap
    // hits mid-week, usage stops Thu/Fri (3-H3, org channel).
    sessionDays: [4, 5, 6, 11, 12, 18, 19, 25, 26], extraPrDays: [0, 1, 8, 13, 14, 15, 20, 21, 22, 27],
    prCount: 8, aiPlan: ['pr_link', 'pr_link', 'pr_link', 'sha'], modules: () => 'src/billing',
    turns: 6, inScopeK: 360, cacheShare: 0.3, warmShare: 0.55, verifShare: 0.5,
    verifCats: ['V2', 'V3'], reviewPlan: [null, 'real', null, null],
    coldChars: 750, skills: ['billing-test-matrix'],
    reverted: [], rework: [{ pr: 5, tier: 'fix_type', after: 4 }],
  },
  {
    handle: 'diego', name: 'Diego Torres', archetype: 'review_skipper', repo: 'acme/checkout', team: 'Checkout', seat: 'standard',
    sessionDays: [0, 1, 4, 5, 6, 7, 11, 12, 14, 15, 19, 20, 25], extraPrDays: [8, 13, 18, 21, 22, 26, 27],
    prCount: 9, aiPlan: Array(7).fill('pr_link'), modules: () => 'src/search',
    turns: 5, inScopeK: 420, cacheShare: 0.25, warmShare: 0.5, verifShare: 0.57,
    verifCats: ['V1', 'V2'], reviewPlan: Array(7).fill(null), // ZERO review loops — the whole point
    coldChars: 850, skills: ['search-index-check'],
    // Both reverts OTHER-caught → the review-gate (team) route, not self-verification.
    reverted: [{ ai: 1, after: 4, by: 'marco' }, { ai: 5, after: 3, by: 'tom' }],
    rework: [{ pr: 0, tier: 'issue_link', after: 5 }, { pr: 7, tier: 'fix_type', after: 3 }],
  },
  {
    handle: 'emma', name: 'Emma Johansson', archetype: 'steady_median', repo: 'acme/platform', team: 'Platform', seat: 'standard',
    sessionDays: [0, 1, 5, 6, 8, 11, 13, 14, 18, 20, 25, 26], extraPrDays: [4, 7, 12, 15, 19, 21, 27],
    prCount: 10, aiPlan: Array(6).fill('pr_link'), modules: () => 'src/reporting',
    turns: 5, inScopeK: 440, cacheShare: 0.3, warmShare: 0.55, verifShare: 0.55,
    verifCats: ['V2', 'V3'], reviewPlan: [null, 'real', null, 'real', null, null],
    coldChars: 800, skills: ['test-data'],
    // Invokes asha's api-client skill → asha's multiplier signal (L5 gate).
    invokesForeignSkill: 'api-client',
    reverted: [{ ai: 3, after: 4, by: 'asha' }],
    // One fix follow-up lands on a wip-increment-labeled PR → EXCLUDED by the
    // ladder (deliberate staged shipping is not a defect); one real fix counts.
    rework: [{ pr: 2, tier: 'fix_type', after: 4 }, { pr: 8, tier: 'fix_type', after: 3, wip: true }],
  },
];

// ── Generation ───────────────────────────────────────────────────────────────
const SIZES = {
  S: { files: 2, hunks: 3, modules: 1, blast: false },
  M: { files: 6, hunks: 10, modules: 2, blast: false },
  L: { files: 14, hunks: 25, modules: 4, blast: true },
};
const SIZE_CYCLE = ['S', 'M', 'S', 'L', 'M', 'S', 'M', 'L', 'S', 'M', 'S', 'M'];

const developers = [];
const prs = [];
const commits = [];
const sessions = [];
const skills = [];
let prSeq = { 'acme/checkout': 100, 'acme/platform': 200 };

for (const dev of DEVS) {
  const devId = uuid(`dev:${dev.handle}`);
  developers.push({
    id: devId, handle: dev.handle, name: dev.name, archetype: dev.archetype,
    team: dev.team, seat_tier: dev.seat, created_at: day(0, 8),
  });

  // v3.skills — Source: Claude Code config scan (P1). Natural key: (developer_id, name).
  for (const [si, name] of (dev.skills ?? []).entries()) {
    skills.push({
      id: uuid(`skill:${dev.handle}:${name}`), developer_id: devId, name,
      authored_at: day(1 + si * 2, 9), path: `~/.claude/skills/${name}/SKILL.md`,
    });
  }

  // v3.prs — Source: GitHub App REST backfill + webhooks (P1). Natural key: (repo, number).
  // AI PRs merge on session days (the delivery session links them); non-AI PRs
  // land on extraPrDays so the working-day denominator is honest.
  const aiCount = dev.aiPlan.length;
  const devPrs = [];
  for (let i = 0; i < dev.prCount; i++) {
    const isAi = i < aiCount;
    const dayPool = isAi ? dev.sessionDays : dev.extraPrDays;
    const d = dayPool[(i * 5 + 2) % dayPool.length];
    const number = prSeq[dev.repo]++;
    const size = SIZES[SIZE_CYCLE[i % SIZE_CYCLE.length]];
    const mergeSha = sha(`pr:${dev.repo}:${number}`);
    const pr = {
      id: uuid(`pr:${dev.repo}:${number}`), developer_id: devId, repo: dev.repo, number,
      title: `${isAi ? 'feat' : 'chore'}: ${dev.handle} change #${i + 1}`,
      head_ref: `${dev.handle}/feature-${i + 1}`, merge_sha: mergeSha,
      opened_at: day(Math.max(0, d - 1), 9), merged_at: day(d, 16),
      files_changed: size.files, hunks: size.hunks, modules: size.modules, blast: size.blast,
      module_path: dev.modules(i, isAi), is_revert: false, revert_of: null,
      labels: [], _d: d, _isAi: isAi, _method: isAi ? dev.aiPlan[i] : null,
    };
    devPrs.push(pr);
    prs.push(pr);

    // v3.commits — Source: GitHub App per-PR commit list (P1). Natural key: sha.
    // Every AI PR keeps its Co-authored-by trailer (dogfooding convention) —
    // which is exactly why the coauthor fallback over-links without the
    // pr_link-suppression hardening the engine applies.
    commits.push({
      id: uuid(`commit:${mergeSha}`), developer_id: devId, repo: dev.repo, sha: mergeSha,
      pr_number: number, message: pr.title, authored_at: day(d, 15),
      co_authored_by_claude: isAi, hunk_overlap_pr: null, linked_issue_kind: null,
    });
  }

  // wip-increment labels (KPI 10 exclusion demo).
  for (const rw of dev.rework ?? []) {
    if (rw.wip) devPrs[rw.pr].labels = ['wip-increment'];
  }

  // Revert PRs — NATIVE revert linkage (P1, 📐): the revert PR carries a
  // platform-recorded reference (revert_of) to the original. Self-caught
  // reverts are authored by the same dev; the ENGINE derives who-caught from
  // authorship and routes the ACTION (self → verification coaching, other →
  // review gate) while ALL reverts count in the KPI 7 rate.
  for (const rv of dev.reverted ?? []) {
    const target = devPrs[rv.ai];
    target._reverted = true;
    const byDev = rv.by === 'self' ? dev : DEVS.find((x) => x.handle === rv.by);
    const number = prSeq[dev.repo]++;
    const d = Math.min(27, target._d + rv.after);
    const revSha = sha(`pr:${dev.repo}:${number}`);
    prs.push({
      id: uuid(`pr:${dev.repo}:${number}`), developer_id: uuid(`dev:${byDev.handle}`),
      repo: dev.repo, number, title: `Revert "${target.title}"`,
      head_ref: `revert-${target.number}`, merge_sha: revSha,
      opened_at: day(d, 9), merged_at: day(d, 11),
      files_changed: target.files_changed, hunks: target.hunks, modules: target.modules,
      blast: target.blast, module_path: target.module_path,
      is_revert: true, revert_of: target.number, labels: [], _d: d, _isAi: false, _method: null,
    });
    commits.push({
      id: uuid(`commit:${revSha}`), developer_id: uuid(`dev:${byDev.handle}`), repo: dev.repo,
      sha: revSha, pr_number: number, message: `Revert "${target.title}"`,
      authored_at: day(d, 10), co_authored_by_claude: false, hunk_overlap_pr: null, linked_issue_kind: null,
    });
  }

  // Fix follow-up commits — KPI 10 raw evidence (P1). The engine applies the
  // evidence ladder: bug issue link → conventional `fix:` type → fix-pattern
  // message, each ANDed with same-hunk overlap ≤14d (hunk_overlap_pr).
  for (const [ri, rw] of (dev.rework ?? []).entries()) {
    const target = devPrs[rw.pr];
    const d = Math.min(27, target._d + rw.after);
    const fixSha = sha(`fix:${dev.handle}:${ri}`);
    const message =
      rw.tier === 'issue_link' ? `resolve overflow on ${target.module_path} (#${900 + ri})`
      : rw.tier === 'fix_type' ? `fix: correct ${target.module_path} edge case after #${target.number}`
      : `patch crash in ${target.module_path} introduced by recent change`;
    commits.push({
      id: uuid(`commit:${fixSha}`), developer_id: devId, repo: dev.repo, sha: fixSha,
      pr_number: null, message, authored_at: day(d, 12),
      co_authored_by_claude: false, hunk_overlap_pr: target.number,
      linked_issue_kind: rw.tier === 'issue_link' ? 'bug' : null,
    });
  }

  // v3.sessions — Source: Claude Code logs, local JSONL parse (P1) + P2 parser
  // extensions (verification_events, review_pass, context_read_at_start — the
  // data is already on disk). Natural key: session_key.
  // One DELIVERY session per AI PR (carries the link evidence), plus filler
  // sessions to fill the dev's session days. Token budget: delivery 60% /
  // filler 40% of inScopeK. first_prompt_chars is a LENGTH FLAG only.
  const aiPrs = devPrs.filter((p) => p._isAi);
  const deliveryBudget = (dev.inScopeK * 0.6) / Math.max(1, aiPrs.length);
  const usedDays = new Set();
  for (const [i, pr] of aiPrs.entries()) {
    usedDays.add(pr._d);
    const method = pr._method;
    const warm = rng() < dev.warmShare;
    const verified = rng() < dev.verifShare;
    const review = dev.reviewPlan[i] ?? null;
    const tokensK = Math.max(4, jitter(Math.round(deliveryBudget), 3));
    const tokensIn = Math.round(tokensK * 700);
    sessions.push({
      id: uuid(`session:${dev.handle}:delivery:${i}`), developer_id: devId,
      session_key: `${dev.handle}-delivery-${i}`, repo: dev.repo,
      branch: method === 'coauthor' ? 'HEAD' : pr.head_ref,
      started_at: day(pr._d, 9, 30), turns: Math.max(2, jitter(dev.turns, 1)),
      model: 'claude-sonnet-4-6',
      tokens_in: tokensIn, tokens_out: Math.round(tokensK * 300),
      cache_read_tokens: Math.round((tokensIn * dev.cacheShare) / (1 - dev.cacheShare)),
      cache_creation_tokens: Math.round(tokensIn * 0.2),
      first_prompt_chars: warm ? jitter(260, 60) : jitter(dev.coldChars, 150),
      context_read_at_start: warm,
      pr_refs: method === 'pr_link' ? [{ repo: pr.repo, number: pr.number }] : [],
      sha_refs: method === 'sha' ? [pr.merge_sha.slice(0, 12)] : [],
      skill_invocations: (dev.skills ?? []).length && rng() < 0.6
        ? [{ name: dev.skills[0], had_output: true }] : [],
      verification_events: verified
        ? dev.verifCats.map((c) => ({
            category: c,
            cmd: c === 'V1' ? 'npm run build' : c === 'V2' ? 'npm test' : c === 'V3' ? 'npm run lint' : 'curl localhost:3000/api/health',
            duration_ms: 1500 + Math.floor(rng() * 20000), exit_code: 0,
          }))
        : [],
      review_pass:
        review === 'real' ? { ran: true, diff_changed: true, findings: 2 }
        : review === 'nofind' ? { ran: true, diff_changed: false, findings: 0 }
        : review === 'theater' ? { ran: true, diff_changed: false, findings: null }
        : null,
    });
  }
  // Filler sessions (unlinked in-scope work: reading, small tasks).
  const fillerDays = dev.sessionDays.filter((d) => !usedDays.has(d));
  const fillerBudget = (dev.inScopeK * 0.4) / Math.max(1, fillerDays.length);
  for (const [i, d] of fillerDays.entries()) {
    const warm = rng() < dev.warmShare;
    const tokensK = Math.max(2, jitter(Math.round(fillerBudget), 2));
    const tokensIn = Math.round(tokensK * 700);
    sessions.push({
      id: uuid(`session:${dev.handle}:filler:${i}`), developer_id: devId,
      session_key: `${dev.handle}-filler-${i}`, repo: dev.repo, branch: 'main',
      started_at: day(d, 14), turns: Math.max(1, jitter(Math.round(dev.turns / 2), 1)),
      model: 'claude-sonnet-4-6',
      tokens_in: tokensIn, tokens_out: Math.round(tokensK * 300),
      cache_read_tokens: Math.round((tokensIn * dev.cacheShare) / (1 - dev.cacheShare)),
      cache_creation_tokens: Math.round(tokensIn * 0.2),
      first_prompt_chars: warm ? jitter(240, 50) : jitter(dev.coldChars, 120),
      context_read_at_start: warm,
      pr_refs: [], sha_refs: [],
      skill_invocations:
        dev.invokesForeignSkill && i === 0
          ? [{ name: dev.invokesForeignSkill, had_output: true }]
          : (dev.skills ?? []).length && rng() < 0.4
            ? [{ name: dev.skills[0], had_output: true }] : [],
      verification_events: [], review_pass: null,
    });
  }
  // Out-of-scope exploration (acme/labs) + in-scope dead-end sessions (ravi).
  for (const [i, d] of (dev.labsSessions?.days ?? []).entries()) {
    const tokensK = Math.round(dev.labsSessions.tokensK / dev.labsSessions.days.length);
    const tokensIn = Math.round(tokensK * 700);
    sessions.push({
      id: uuid(`session:${dev.handle}:labs:${i}`), developer_id: devId,
      session_key: `${dev.handle}-labs-${i}`, repo: 'acme/labs', branch: 'main',
      started_at: day(d, 20), turns: jitter(14, 3), model: 'claude-opus-4-8',
      tokens_in: tokensIn, tokens_out: Math.round(tokensK * 300),
      cache_read_tokens: Math.round(tokensIn * 0.05), cache_creation_tokens: Math.round(tokensIn * 0.3),
      first_prompt_chars: jitter(dev.coldChars, 200), context_read_at_start: false,
      pr_refs: [], sha_refs: [], skill_invocations: [], verification_events: [], review_pass: null,
    });
  }
  for (const [i, de] of (dev.deadEnds ?? []).entries()) {
    const tokensIn = Math.round(de.tokensK * 700);
    sessions.push({
      id: uuid(`session:${dev.handle}:deadend:${i}`), developer_id: devId,
      session_key: `${dev.handle}-deadend-${i}`, repo: dev.repo, branch: 'main',
      started_at: day(de.d, 21), turns: jitter(22, 3), model: 'claude-opus-4-8',
      tokens_in: tokensIn, tokens_out: Math.round(de.tokensK * 300),
      cache_read_tokens: Math.round(tokensIn * 0.05), cache_creation_tokens: Math.round(tokensIn * 0.35),
      first_prompt_chars: jitter(dev.coldChars, 200), context_read_at_start: false,
      pr_refs: [], sha_refs: [], skill_invocations: [], verification_events: [], review_pass: null,
    });
  }
}

// ── v3.deploy_events — Source: GitHub Deployments webhooks (P3, 🔧). ─────────
// Natural key: deploy_key. The engine applies the PUBLISHED Tier-1 rule:
// failed = a rollback references the deploy, OR a fix-tagged deploy ships ≤48h
// on the same service. Single-PR deploys attribute cleanly; the hotfix deploy
// below carries 2 PRs → the engine flags it low-confidence (batch blur, 9-H3).
const prOf = (handle, aiIdx) => {
  const dev = DEVS.find((d) => d.handle === handle);
  return prs.filter((p) => p.developer_id === uuid(`dev:${handle}`) && p._isAi)[aiIdx];
};
const deployEvents = [];
let dseq = 1;
const mkDeploy = (repo, service, d, hour, kind, prList, extra = {}) => {
  const key = `${service}-${String(dseq++).padStart(3, '0')}`;
  deployEvents.push({
    id: uuid(`deploy:${key}`), repo, service, deploy_key: key,
    deployed_at: day(d, hour), status: 'success',
    kind, rollback_of: extra.rollback_of ?? null, fix_tagged: extra.fix_tagged ?? false,
    merge_shas: prList.map((p) => p.merge_sha),
  });
  return key;
};
// checkout: 10 deploys; one rolled back (marco's reverted PR — clean single-PR
// attribution), one hotfixed ≤48h (diego + tom in the same deploy — batch blur).
const marcoBad = prOf('marco', 1);
const diegoBad = prOf('diego', 1);
const tomOk = prOf('tom', 0);
const checkoutPrs = prs.filter((p) => p.repo === 'acme/checkout' && p.merged_at && !p.is_revert);
const badKey = mkDeploy('acme/checkout', 'checkout-web', marcoBad._d, 18, 'deploy', [marcoBad]);
mkDeploy('acme/checkout', 'checkout-web', marcoBad._d + 1, 6, 'rollback', [marcoBad], { rollback_of: badKey });
mkDeploy('acme/checkout', 'checkout-web', diegoBad._d, 18, 'deploy', [diegoBad, tomOk]);
mkDeploy('acme/checkout', 'checkout-web', diegoBad._d + 1, 9, 'hotfix', [diegoBad], { fix_tagged: true });
for (let i = 0; i < 6; i++) {
  const batch = checkoutPrs.filter((p) => p._d === WEEKDAYS[3 + i * 3]).slice(0, 3);
  if (batch.length) mkDeploy('acme/checkout', 'checkout-web', WEEKDAYS[3 + i * 3], 19, 'deploy', batch);
}
// platform: 8 deploys, zero failures.
const platformPrs = prs.filter((p) => p.repo === 'acme/platform' && p.merged_at && !p.is_revert);
for (let i = 0; i < 8; i++) {
  const batch = platformPrs.filter((p) => p._d === WEEKDAYS[1 + i * 2]).slice(0, 3);
  if (batch.length) mkDeploy('acme/platform', 'platform-api', WEEKDAYS[1 + i * 2], 19, 'deploy', batch);
}

// ── v3.coaching_events — Source: Prism plugin (Addendum B, P4, 🔧). ──────────
// Natural key: (developer_id, ts, rule_id). Metadata ONLY — the prompt text
// never leaves the developer's machine; these rows are what the plugin exports.
// Need-gated: each event's `gate` names the below-target KPI that armed it.
const CE = (handle, d, h, m, rule, gate, trigger, intervention, message, outcome) => ({
  id: uuid(`coach:${handle}:${d}:${h}:${m}:${rule}`), developer_id: uuid(`dev:${handle}`),
  ts: day(d, h, m), rule_id: rule, gate, trigger, intervention, message, outcome,
});
const coachingEvents = [
  // tom — the default "self": a full over-the-shoulder day (Tab 2 replay).
  CE('tom', 26, 9, 32, 'C1', 'KPI 4 iterations below target', 'first prompt lacked file refs; 3 exploratory turns', 'enrich', 'Added repo map + recent-diff context to your turn.', 'acted'),
  CE('tom', 26, 9, 48, 'C1', 'KPI 4 iterations below target', 'prompt lacked acceptance criteria', 'coach', 'Front-load the file + the goal — your last 3 turns were exploratory.', 'acted'),
  CE('tom', 26, 10, 15, 'C2', 'KPI 6 tokens high + cache-read 8%', 'large un-compacted context re-sent', 'coach', 'Compact/pin the context block — cache-read is 8% vs the 34% norm.', 'acted'),
  CE('tom', 26, 11, 5, 'C5', 'harness correctness (everyone)', 'Edit on file never Read this session', 'enrich', 'Instructed the agent to read checkout-flow/cart.ts before editing.', 'acted'),
  CE('tom', 26, 11, 40, 'C4', 'KPI 7/10 weak (1 revert, 20% rework)', 'diff touches src/ with no test changes in session', 'coach', 'src/ changed with no tests in this session — run the tests skill before the PR.', 'ignored'),
  CE('tom', 26, 14, 20, 'C3', 'Harness index low (12.5)', 'prompt matches a domain with a squad skill', 'coach', 'search-index-check.skill.md covers this — squad users merge ~2× faster.', 'dismissed'),
  CE('tom', 26, 15, 2, 'C2', 'KPI 6 tokens high + cache-read 8%', 'compaction thrash detected (cache-creation ÷ input spike)', 'coach', 'Checkpoint to a handoff file and continue fresh — this session is thrashing compaction.', 'acted'),
  CE('tom', 27, 9, 15, 'C1', 'KPI 4 iterations below target', '1,842-char first prompt (hand-carried context)', 'coach', 'Save this intro as CLAUDE.md — one click, and every session starts warm.', 'acted'),
  CE('tom', 27, 10, 30, 'C5', 'harness correctness (everyone)', 'Write on file never Read this session', 'enrich', 'Instructed the agent to read the migration file first.', 'acted'),
  CE('tom', 27, 11, 55, 'C4', 'KPI 7/10 weak (1 revert, 20% rework)', 'AI-majority diff + no tests + size L', 'coach', 'Large AI diff with no tests — add the coverage pass before opening the PR.', 'acted'),
  CE('tom', 27, 14, 10, 'C6', 'safety (org-configured)', 'change on sensitive path src/payments without review', 'flag', 'Flagged: payments path changed without a review pass (logged, not blocking).', 'ignored'),
  CE('tom', 27, 15, 45, 'C2', 'KPI 6 tokens high + cache-read 8%', 'context re-sent from scratch', 'coach', 'Pin the shared context block — three re-sends this session.', 'ignored'),
  // marco — no harness: C4 keeps firing, mostly ignored (matches his reverts).
  CE('marco', 26, 10, 5, 'C4', 'KPI 7 weak (3 reverts in 8 AI PRs)', 'diff touches src/cart with no test changes', 'coach', 'No tests in session on cart logic — run npm test before the PR.', 'ignored'),
  CE('marco', 26, 13, 40, 'C4', 'KPI 7 weak (3 reverts in 8 AI PRs)', 'PR opened with zero verification events', 'coach', 'This PR shipped unverified — the last two like it were reverted.', 'ignored'),
  CE('marco', 27, 9, 50, 'C1', 'KPI 4 iterations below target', 'exploratory turn streak', 'enrich', 'Injected cart module map to shortcut exploration.', 'acted'),
  CE('marco', 27, 11, 20, 'C4', 'KPI 7 weak (3 reverts in 8 AI PRs)', 'diff + no tests again', 'coach', 'Tests skill reminder (3rd this week — rate cap reached for today).', 'acted'),
  // ravi — over-generation: C2 pressure + one C3.
  CE('ravi', 26, 20, 10, 'C2', 'KPI 6 tokens 90k/PR', 'session re-sending 60k-token context', 'coach', 'This session re-sent ~60k tokens of context — compact or pin it.', 'ignored'),
  CE('ravi', 26, 21, 30, 'C2', 'KPI 6 tokens 90k/PR', 'dead-end loop signature (high tokens, no diff)', 'coach', 'High-token loop with no diff for 40 minutes — checkpoint and restart fresh.', 'acted'),
  CE('ravi', 27, 20, 45, 'C3', 'Harness index low', 'payments domain prompt; payments-mock skill exists', 'coach', 'payments-mock.skill.md covers this setup — one invocation replaces ~10 turns.', 'acted'),
  // diego — review skipper: C4 at PR time.
  CE('diego', 26, 12, 15, 'C4', 'KPI 7 weak (2 other-caught reverts)', 'PR opening without review pass', 'coach', 'Run the /review pass before opening — your last revert was caught by a reviewer.', 'ignored'),
  CE('diego', 27, 12, 40, 'C4', 'KPI 7 weak (2 other-caught reverts)', 'PR opening without review pass', 'coach', 'Review pass reminder (looped PRs get ~4× fewer reviewer comments).', 'acted'),
  // nadia / lena / sofia / emma / jin / asha — light touch.
  CE('nadia', 26, 9, 25, 'C2', 'KPI 6 mid + capped seat', 'context re-send under quota pressure', 'coach', 'Pin the billing context — you hit the seat cap Wednesday; make tokens count.', 'acted'),
  CE('lena', 26, 10, 55, 'C1', 'KPI 4 iterations below target', 'vague first prompt after 2-week gap', 'enrich', 'Re-attached notifications module context after the usage gap.', 'acted'),
  CE('sofia', 27, 10, 5, 'C4', 'KPI 10 guard', 'legacy-path diff without tests', 'coach', 'First legacy AI change — add the fixture tests before the PR.', 'acted'),
  CE('emma', 27, 11, 10, 'C3', 'no gate breach — discovery', 'reporting-domain prompt matches api-client skill', 'coach', "asha's api-client skill covers this endpoint pattern.", 'acted'),
  CE('jin', 27, 14, 30, 'C1', 'KPI 3 cadence 17%', 'first session in 6 days', 'enrich', 'Warm-started with the orders module map.', 'acted'),
  CE('asha', 27, 9, 5, 'C6', 'safety (org-configured)', 'release-notes touches deploy config', 'flag', 'Deploy-config change logged for the release checklist.', 'ignored'),
];

// ── Upserts (idempotent — natural keys as documented per section) ────────────
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });

// Columns that are jsonb (must ALWAYS be JSON.stringified — a bare JS array
// would be serialized by pg as a Postgres array literal, not JSON).
const JSONB_COLS = new Set(['pr_refs', 'skill_invocations', 'verification_events', 'review_pass', 'meta']);

async function upsert(table, rows, conflict, cols) {
  if (!rows.length) return;
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const updates = cols.filter((c) => !conflict.includes(c)).map((c) => `${c} = excluded.${c}`).join(', ');
  for (const row of rows) {
    const values = cols.map((c) => {
      const v = row[c];
      if (v === undefined || v === null) return null;
      if (JSONB_COLS.has(c)) return JSON.stringify(v);
      return v; // scalars + text[] arrays (pg serializes JS arrays to Postgres arrays)
    });
    await client.query(
      `insert into v3.${table} (${cols.join(', ')}) values (${placeholders})
       on conflict (${conflict.join(', ')}) do update set ${updates}`,
      values,
    );
  }
  console.log(`  ✓ v3.${table}: ${rows.length} rows upserted`);
}

try {
  await client.connect();
  await client.query('begin');

  await upsert('repos', REPOS, ['repo'],
    ['repo', 'connected', 'has_build', 'has_tests', 'has_lint', 'has_claude_md', 'verify_rule_in_claude_md']);
  await upsert('developers', developers, ['handle'],
    ['id', 'handle', 'name', 'archetype', 'team', 'seat_tier', 'created_at']);
  await upsert('skills', skills, ['developer_id', 'name'],
    ['id', 'developer_id', 'name', 'authored_at', 'path']);
  await upsert('prs', prs, ['repo', 'number'],
    ['id', 'developer_id', 'repo', 'number', 'title', 'head_ref', 'merge_sha', 'opened_at', 'merged_at',
     'files_changed', 'hunks', 'modules', 'blast', 'module_path', 'is_revert', 'revert_of', 'labels']);
  await upsert('commits', commits, ['sha'],
    ['id', 'developer_id', 'repo', 'sha', 'pr_number', 'message', 'authored_at',
     'co_authored_by_claude', 'hunk_overlap_pr', 'linked_issue_kind']);
  await upsert('sessions', sessions, ['session_key'],
    ['id', 'developer_id', 'session_key', 'repo', 'branch', 'started_at', 'turns', 'model',
     'tokens_in', 'tokens_out', 'cache_read_tokens', 'cache_creation_tokens', 'first_prompt_chars',
     'context_read_at_start', 'pr_refs', 'sha_refs', 'skill_invocations', 'verification_events', 'review_pass']);
  await upsert('deploy_events', deployEvents, ['deploy_key'],
    ['id', 'repo', 'service', 'deploy_key', 'deployed_at', 'status', 'kind', 'rollback_of', 'fix_tagged', 'merge_shas']);
  await upsert('coaching_events', coachingEvents, ['developer_id', 'ts', 'rule_id'],
    ['id', 'developer_id', 'ts', 'rule_id', 'gate', 'trigger', 'intervention', 'message', 'outcome']);

  await client.query('commit');
  console.log(`\n✓ v3 seed complete: ${developers.length} developers, ${prs.length} PRs, ` +
    `${sessions.length} sessions, ${commits.length} commits, ${deployEvents.length} deploys, ` +
    `${coachingEvents.length} coaching events.`);
  console.log('  Raw rows only — run `npm run v3:recompute` to build KPIs/indexes/insights.');
} catch (err) {
  await client.query('rollback').catch(() => {});
  console.error('✗ seed failed:', err.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
