// Hand-computable mini fixture for engine tests. One connected repo (+ one
// unconnected), two developers. Never imported by app code.

import type {
  CommitRow, DeveloperRow, KpiCatalogRow, PrRow, RepoRow, SessionRow, SkillRow,
  DeployEventRow, IndexConfig, ConfigVersionRow,
} from '@prism/contract';

export const DEV_A: DeveloperRow = {
  id: 'dev-a', handle: 'a', name: 'Dev A', archetype: 'steady_median',
  team: 'T', seat_tier: 'standard', created_at: '2026-06-01T00:00:00Z',
};
export const DEV_B: DeveloperRow = {
  id: 'dev-b', handle: 'b', name: 'Dev B', archetype: 'steady_median',
  team: 'T', seat_tier: 'standard', created_at: '2026-06-01T00:00:00Z',
};

export const REPOS: RepoRow[] = [
  { repo: 'o/main', connected: true, has_build: true, has_tests: true, has_lint: false, has_claude_md: false, verify_rule_in_claude_md: false },
  { repo: 'o/labs', connected: false, has_build: true, has_tests: false, has_lint: false, has_claude_md: false, verify_rule_in_claude_md: false },
];

export const pr = (over: Partial<PrRow>): PrRow => ({
  id: `pr-${over.number}`, developer_id: DEV_A.id, repo: 'o/main', number: 1,
  title: 'feat: x', head_ref: 'a/f1', merge_sha: `sha-${over.number ?? 1}`,
  opened_at: '2026-06-09T00:00:00Z', merged_at: '2026-06-10T00:00:00Z',
  files_changed: 2, hunks: 3, modules: 1, blast: false, module_path: 'src/x',
  is_revert: false, revert_of: null, labels: [], ...over,
});

export const session = (over: Partial<SessionRow>): SessionRow => ({
  id: `s-${over.session_key}`, developer_id: DEV_A.id, session_key: 'sk', repo: 'o/main',
  branch: 'main', started_at: '2026-06-10T09:00:00Z', turns: 5, model: 'claude-sonnet-4-6',
  tokens_in: 7000, tokens_out: 3000, cache_read_tokens: 0, cache_creation_tokens: 0,
  first_prompt_chars: 300, context_read_at_start: false,
  pr_refs: [], sha_refs: [], skill_invocations: [], verification_events: [], review_pass: null,
  ...over,
});

export const commit = (over: Partial<CommitRow>): CommitRow => ({
  id: `c-${over.sha}`, developer_id: DEV_A.id, repo: 'o/main', sha: 'c1', pr_number: null,
  message: 'feat: x', authored_at: '2026-06-10T12:00:00Z', co_authored_by_claude: false,
  hunk_overlap_pr: null, linked_issue_kind: null, ...over,
});

export const deploy = (over: Partial<DeployEventRow>): DeployEventRow => ({
  id: `d-${over.deploy_key}`, repo: 'o/main', service: 'svc', deploy_key: 'd1',
  deployed_at: '2026-06-11T00:00:00Z', status: 'success', kind: 'deploy',
  rollback_of: null, fix_tagged: false, merge_shas: [], ...over,
});

export const skill = (over: Partial<SkillRow>): SkillRow => ({
  id: `sk-${over.name}`, developer_id: DEV_A.id, name: 'helper',
  authored_at: '2026-06-05T00:00:00Z', path: '~/.claude/skills/helper/SKILL.md', ...over,
});

// Catalog with the lab's exact anchors.
export const CATALOG: KpiCatalogRow[] = [
  row('ai_share', 1, 'main', 'usage', 'up', { floor: 50, target: 100 }),
  row('cadence', 3, 'main', 'usage', 'up', { floor: 30, target: 80 }),
  row('iterations', 4, 'main', 'efficiency', 'down', { target: 3, ceil: 12 }),
  row('tokens', 6, 'main', 'efficiency', 'down', { target: 30, ceil: 90 }),
  row('revert', 7, 'main', 'outcomes', 'up', { floor: 80, target: 98 }),
  row('reliability', 9, 'diagnostic', 'outcomes', 'down', { target: 5, ceil: 30 }),
  row('rework', 10, 'main', 'outcomes', 'down', { target: 5, ceil: 30 }),
  row('skills_authored', 12, 'harness', 'harness', 'up', { floor: 0, target: 3 }),
  row('verification', 13, 'harness', 'harness', 'up', { floor: 30, target: 80 }),
  row('review_loop', 14, 'harness', 'harness', 'up', { floor: 20, target: 70 }),
  row('continuity', 15, 'harness', 'harness', 'up', { floor: 30, target: 80 }),
];

function row(
  kpi_id: string, num: number, index_kind: string, dimension: string,
  direction: string, anchor: { floor?: number; target: number; ceil?: number },
): KpiCatalogRow {
  return {
    kpi_id, num, index_kind, dimension, direction, anchor,
    name: kpi_id, question: '', formula_text: '', unit: '', trust: 'high', status: 'live',
    data_point_ids: [], enabled_default: true,
  } as KpiCatalogRow;
}

export const CONFIG_V1: IndexConfig = {
  weights: {
    ai_share: 7.5, cadence: 7.5, iterations: 17.5, tokens: 17.5, revert: 25, rework: 25,
    skills_authored: 25, verification: 25, review_loop: 25, continuity: 25,
  },
  disabled: [],
};

export const CONFIG_VERSION: ConfigVersionRow = {
  version: 1, created_at: '2026-07-02T00:00:00Z', active: true, config: CONFIG_V1, note: 'test',
};
