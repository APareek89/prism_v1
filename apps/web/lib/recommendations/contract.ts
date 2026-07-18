import type { RuleOutput } from './types';

export const ACTIVE_RECOMMENDATION_LIMIT = 3;
export const RECOMMENDATION_TRACE_VERSION = 'recommendation-trace-v1';

interface RecommendationPlan {
  action: string;
  expectedSignal: string;
  verificationPlan: string;
  doNoHarm: string;
}

const PLANS: Record<string, RecommendationPlan> = {
  'skill-author': {
    action: 'Capture one repeated workflow as a small reusable skill with inputs, checks, and an example.',
    expectedSignal: 'A real authored-skill signal appears and the workflow is reused in later delivery.',
    verificationPlan: 'Re-run after a complete measured window and verify authored-skill evidence plus linked delivery.',
    doNoHarm: 'Do not create a skill only to increase a count; it must remove repeat work and retain its checks.',
  },
  'skill-reuse': {
    action: 'Publish one proven personal workflow for another engineer to use on comparable work.',
    expectedSignal: 'The authored workflow records cross-person reuse backed by a real session.',
    verificationPlan: 'Verify reuse and its linked output in a later measured window before calling it adopted.',
    doNoHarm: 'Do not pressure teammates to run irrelevant workflows merely to create reuse evidence.',
  },
  'acceptance-rate': {
    action: 'Add acceptance criteria and relevant file context before asking the coding agent to change code.',
    expectedSignal: 'Suggestion acceptance improves without an increase in rework or reverts.',
    verificationPlan: 'Compare the same acceptance metric and quality guardrails after another full window.',
    doNoHarm: 'Do not accept weak suggestions to improve the rate; review and test remain mandatory.',
  },
  'size-discipline': {
    action: 'Split the next large change into independently reviewable pull requests before implementation.',
    expectedSignal: 'The share of oversized pull requests declines while merged delivery remains healthy.',
    verificationPlan: 'Review persisted size buckets and merge outcomes in the next comparable window.',
    doNoHarm: 'Do not split changes so finely that dependencies, rollback safety, or review context deteriorate.',
  },
  'cache-efficiency': {
    action: 'Reuse stable context and avoid repeatedly sending unchanged material to the coding agent.',
    expectedSignal: 'Cache reuse improves while linked output and delivery quality remain stable.',
    verificationPlan: 'Compare provider-emitted cache counters and linked delivery after a complete window.',
    doNoHarm: 'Do not reuse stale context when the code or requirements have materially changed.',
  },
  'revert-rate': {
    action: 'Add a focused regression check for the failure mode before the next comparable change merges.',
    expectedSignal: 'The merged-without-revert signal improves with no increase in unresolved rework.',
    verificationPlan: 'Verify later AI-linked pull requests against revert and rework evidence.',
    doNoHarm: 'Do not avoid necessary reverts; recovery safety is more important than protecting the metric.',
  },
  'course-nudge': {
    action: 'Complete the assigned focused learning resource and apply it to one real delivery workflow.',
    expectedSignal: 'The knowledge check passes and the related measured workflow signal improves.',
    verificationPlan: 'Require both course completion evidence and a later real-work signal before verification.',
    doNoHarm: 'Do not treat course completion alone as performance improvement.',
  },
};

const FALLBACK: RecommendationPlan = {
  action: 'Apply the recommended workflow change to one suitable piece of real work.',
  expectedSignal: 'The cited metric moves in the intended direction without quality regression.',
  verificationPlan: 'Compare the same evidence after a complete measured window.',
  doNoHarm: 'Do not optimize the cited metric in isolation from delivery quality.',
};

export function recommendationTrace(out: RuleOutput): Record<string, unknown> {
  const plan = PLANS[out.detectedVia] ?? FALLBACK;
  return {
    traceVersion: RECOMMENDATION_TRACE_VERSION,
    flowType: 'deterministic_recommendation',
    ownership: 'No LLM selects or scores this recommendation. A versioned rule evaluates real persisted evidence.',
    candidate: {
      rule: out.detectedVia,
      kind: out.kind,
      ref: out.ref,
      dimension: out.dimension,
      rank: out.selection?.rank ?? null,
      candidateCount: out.selection?.candidateCount ?? null,
      activeLimit: out.selection?.activeLimit ?? ACTIVE_RECOMMENDATION_LIMIT,
    },
    output: {
      observation: out.rationale,
      interpretation: `The ${out.evidence.metric} rule crossed its configured evidence threshold.`,
      alternativeExplanation: 'The observed gap may reflect work mix or limited evidence coverage; adoption requires re-measurement.',
      action: plan.action,
      expectedSignal: plan.expectedSignal,
      verificationPlan: plan.verificationPlan,
      doNoHarm: plan.doNoHarm,
    },
    evidence: out.evidence,
    stages: [
      { id: 'context_assembly', owner: 'deterministic_code', status: 'accepted', detail: 'Real KPI, pull-request, session, and course facts assembled for the employee window.' },
      { id: 'rule_evaluation', owner: 'deterministic_code', status: 'accepted', detail: `Rule ${out.detectedVia} fired against its explicit threshold.` },
      { id: 'deduplication', owner: 'deterministic_code', status: 'accepted', detail: 'Existing open recommendations checked by employee, kind, and stable reference.' },
      { id: 'priority_cap', owner: 'deterministic_code', status: 'accepted', detail: `Selected within the maximum ${ACTIVE_RECOMMENDATION_LIMIT} active recommendations.` },
      { id: 'reverification', owner: 'deterministic_code', status: 'pending', detail: 'Status advances only when a later measured window satisfies the rule-specific adoption predicate.' },
    ],
  };
}
