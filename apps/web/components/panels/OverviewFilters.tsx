import type { OverviewFilterContext } from '@/lib/db/analytics';

export function OverviewFilters({ context, period }: { context: OverviewFilterContext; period: string }) {
  return <form className="overview-filters" method="get">
    <input type="hidden" name="period" value={period} />
    <div><strong>Operating signal scope</strong><small>The published index remains the organization’s stored deterministic score.</small></div>
    <label>Repository<select name="repo" defaultValue={context.selected.repo}><option value="">All repositories</option>{context.options.repos.map((repo) => <option key={repo} value={repo}>{repo}</option>)}</select></label>
    <label>Team<select name="team" defaultValue={context.selected.team}><option value="">All teams</option>{context.options.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
    <label>Manager<select name="manager" defaultValue={context.selected.manager}><option value="">All managers</option>{context.options.managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name}</option>)}</select></label>
    <button className="button" type="submit">Apply</button>
    {context.active ? <a className="button ghost" href={`/function?period=${encodeURIComponent(period)}`}>Clear</a> : null}
    <span>{context.label}</span>
  </form>;
}
