// computeAll — the deterministic pipeline: raw → links → per-dev KPIs →
// indexes → linkage → insights → recommendations. Pure: no IO, no clock.

import type { KpiId } from '@prism/contract';
import type { ComputeResult, DeveloperComputation, EngineConfig, RawData } from './types';
import { computeLinks, linksByPr } from './link';
import { deriveWindow } from './window';
import { aiPrs, buildContext, computeKpis, multiplierSignal, type DevContext } from './kpis';
import { computeIndexes } from './index-score';
import { runLinkage } from './linkage';
import { deriveInsights, recognitionInsight, type TeamStats } from './insights';
import { deriveRecommendations } from './recommendations';
import { mean } from './normalize';

export function computeAll(raw: RawData, engineConfig: EngineConfig): ComputeResult {
  const { catalog, configVersion } = engineConfig;
  const config = configVersion.config;
  const window = deriveWindow(raw.prs, raw.sessions);
  const winSessions = raw.sessions.filter((s) => s.started_at >= window.startIso && s.started_at <= window.endIso);

  const links = computeLinks(
    raw.prs.filter((p) => p.merged_at && p.merged_at >= window.startIso && p.merged_at <= window.endIso),
    winSessions, raw.commits,
  );
  const byPr = linksByPr(links);

  // Pass 1 — contexts + KPIs for everyone (team stats need the full pass).
  const contexts: DevContext[] = [];
  const kpisByDev = new Map<string, ReturnType<typeof computeKpis>>();
  for (const dev of raw.developers) {
    const ctx = buildContext(dev, raw, byPr, window, winSessions);
    contexts.push(ctx);
    kpisByDev.set(dev.id, computeKpis(ctx, catalog));
  }

  // Team stats for narrative norms (iterations by CLAUDE.md presence, verification by verify-rule).
  const homeRepoOf = (ctx: DevContext) => {
    const counts = new Map<string, number>();
    for (const p of ctx.mergedPrs) counts.set(p.repo, (counts.get(p.repo) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  const groupRaw = (kpiId: KpiId, filter: (ctx: DevContext) => boolean): number | null =>
    mean(contexts.filter(filter).map((c) => {
      const r = kpisByDev.get(c.dev.id)!.find((k) => k.kpi_id === kpiId);
      return r?.raw_value ?? null;
    }).filter((v): v is number => v !== null));
  const hasClaudeMd = (ctx: DevContext) => {
    const home = homeRepoOf(ctx);
    return !!home && !!ctx.repos.get(home)?.has_claude_md;
  };
  const hasVerifyRule = (ctx: DevContext) => {
    const home = homeRepoOf(ctx);
    return !!home && !!ctx.repos.get(home)?.verify_rule_in_claude_md;
  };
  const team: TeamStats = {
    iterationsWithContext: groupRaw('iterations', hasClaudeMd),
    iterationsWithoutContext: groupRaw('iterations', (c) => !hasClaudeMd(c)),
    verificationWithRule: groupRaw('verification', hasVerifyRule),
    verificationWithoutRule: groupRaw('verification', (c) => !hasVerifyRule(c)),
  };

  // Pass 2 — indexes, linkage, insights, recommendations.
  const perDeveloper: DeveloperComputation[] = contexts.map((ctx) => {
    const kpis = kpisByDev.get(ctx.dev.id)!;
    const ai = aiPrs(ctx);
    const connectedSessions = ctx.sessions.filter((s) => s.repo !== null && ctx.connected.has(s.repo));
    const mult = multiplierSignal(ctx);
    const indexes = computeIndexes(kpis, catalog, config, {
      mergedPrs: ctx.mergedPrs.length,
      sessions: ctx.sessions.length,
      aiPrs: ai.length,
      connectedSessions: connectedSessions.length,
      multiplierSignal: mult,
    });
    const linkage = runLinkage(ctx);
    const insights = deriveInsights(ctx, kpis, linkage, team);
    const recognition = recognitionInsight(ctx, mult);
    if (recognition) insights.unshift(recognition);
    const recommendations = deriveRecommendations(kpis, insights, catalog, config);
    return { developer_id: ctx.dev.id, kpis, indexes, insights, recommendations };
  });

  return { date: window.date, windowStart: window.startIso, links, perDeveloper };
}
