import type { Dimension } from '@/lib/ui/view-models';

export type DataSource = 'github' | 'codex' | 'claude_code' | 'sentry';

export interface DataCatalogueItem {
  key: string;
  source: DataSource;
  label: string;
  fields: string;
  significance: string;
  dimensions: Dimension[];
  sensitivity: 'Low' | 'Moderate';
  retention: string;
  required: boolean;
}
/** Product metadata only. Enabled state and consent are persisted per function. */
export const DATA_CATALOGUE: readonly DataCatalogueItem[] = [
  { key: 'github.pull_requests', source: 'github', label: 'Pull requests and merge lifecycle', fields: 'number, author, timestamps, merge state, repository', significance: 'Delivery throughput, merge time, adoption denominator, and evidence drill-down.', dimensions: ['usage', 'efficiency', 'effectiveness'], sensitivity: 'Low', retention: 'While workspace is active', required: true },
  { key: 'github.change_shape', source: 'github', label: 'Change size and file shape', fields: 'additions, deletions, files, hunks, modules, sensitive-path flag', significance: 'Compares like-sized changes and prevents raw volume from being mistaken for impact.', dimensions: ['efficiency', 'effectiveness'], sensitivity: 'Moderate', retention: 'While workspace is active', required: true },
  { key: 'github.commits', source: 'github', label: 'Commit and AI attribution metadata', fields: 'SHA, author, timestamp, PR link, co-author trailer', significance: 'Links opted-in AI work to delivered changes without storing source code.', dimensions: ['usage', 'proficiency'], sensitivity: 'Low', retention: 'While workspace is active', required: true },
  { key: 'github.reverts', source: 'github', label: 'Revert outcomes', fields: 'merge SHA, revert timestamp', significance: 'Supplies durable-change and rework evidence after merge.', dimensions: ['effectiveness'], sensitivity: 'Low', retention: 'While workspace is active', required: false },
  { key: 'llm.session_metadata', source: 'codex', label: 'Codex session metadata', fields: 'session, model, repository, branch, timestamps, event counts', significance: 'Measures tool cadence and associates opted-in activity with delivery evidence.', dimensions: ['usage', 'proficiency'], sensitivity: 'Low', retention: 'Rolling evidence history', required: false },
  { key: 'llm.token_usage', source: 'codex', label: 'Codex token counters', fields: 'input, output, cache read, cache creation', significance: 'Shows token mix and tokens-to-shipped efficiency; prompts and responses are excluded.', dimensions: ['efficiency'], sensitivity: 'Low', retention: 'Rolling evidence history', required: false },
  { key: 'claude.session_metadata', source: 'claude_code', label: 'Claude Code session metadata', fields: 'session, model, repository, branch, timestamps, event counts', significance: 'Measures tool cadence and associates opted-in activity with delivery evidence.', dimensions: ['usage', 'proficiency'], sensitivity: 'Low', retention: 'Rolling evidence history', required: false },
  { key: 'claude.token_usage', source: 'claude_code', label: 'Claude Code token counters', fields: 'input, output, cache read, cache creation', significance: 'Shows token mix and tokens-to-shipped efficiency; prompts and responses are excluded.', dimensions: ['efficiency'], sensitivity: 'Low', retention: 'Rolling evidence history', required: false },
  { key: 'llm.pr_link', source: 'codex', label: 'Verified session-to-PR link', fields: 'session ID, repository, PR number, SHA, branch', significance: 'Raises AI-attribution confidence through exact GitHub-verified linkage.', dimensions: ['usage', 'effectiveness', 'proficiency'], sensitivity: 'Low', retention: 'While workspace is active', required: false },
  { key: 'claude.pr_link', source: 'claude_code', label: 'Verified session-to-PR link', fields: 'session ID, repository, PR number, SHA, branch', significance: 'Raises AI-attribution confidence through exact GitHub-verified linkage.', dimensions: ['usage', 'effectiveness', 'proficiency'], sensitivity: 'Low', retention: 'While workspace is active', required: false },
  { key: 'sentry.incidents', source: 'sentry', label: 'Production incidents', fields: 'incident identifier, service, severity, linked deployment, timestamps', significance: 'Adds production-outcome evidence for change failure and recovery signals.', dimensions: ['effectiveness'], sensitivity: 'Moderate', retention: 'While workspace is active', required: false },
] as const;

export const DIMENSION_DEPENDENCIES: Record<Dimension, string[]> = {
  usage: ['github.pull_requests', 'github.commits', 'llm.session_metadata|claude.session_metadata'],
  efficiency: ['github.pull_requests', 'github.change_shape', 'llm.token_usage|claude.token_usage'],
  effectiveness: ['github.pull_requests', 'github.reverts'],
  proficiency: ['github.commits', 'llm.session_metadata|claude.session_metadata'],
};

export function disabledDimensionReason(
  dimension: Dimension,
  enabledKeys: ReadonlySet<string>,
): string | null {
  const missing = DIMENSION_DEPENDENCIES[dimension].filter((requirement) =>
    requirement.includes('|')
      ? !requirement.split('|').some((key) => enabledKeys.has(key))
      : !enabledKeys.has(requirement),
  );
  if (!missing.length) return null;
  return `Enable ${missing.map((value) => value.replace('|', ' or ')).join(', ')} in Data configuration.`;
}
