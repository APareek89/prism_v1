import type { AnalyticsSnapshot, TokenCounterStatus } from '@/lib/db/analytics';

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

function counterLabel(status: TokenCounterStatus): string {
  if (status === 'not_approved') return 'Token processing not approved';
  if (status === 'not_emitted') return 'Counters not captured';
  if (status === 'no_sessions') return 'Awaiting sessions';
  return '';
}

function ComparisonBadge({ current, previous, available, label, unit = 'percent' }: { current: number | null; previous: number | null; available: boolean; label: string; unit?: 'percent' | 'points' | 'absolute' }) {
  if (!available) return <span className="metric-comparison pending">No prior measured period</span>;
  if (current === null || previous === null) return <span className="metric-comparison pending">Comparison unavailable</span>;
  const delta = current - previous;
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  let value: string;
  if (unit === 'points') value = `${delta >= 0 ? '+' : ''}${number.format(delta)} pp`;
  else if (unit === 'absolute' || previous === 0) value = `${delta >= 0 ? '+' : ''}${number.format(delta)}`;
  else value = `${delta >= 0 ? '+' : ''}${number.format((delta / Math.abs(previous)) * 100)}%`;
  return <span className={`metric-comparison ${direction}`}>{direction === 'up' ? '↑' : direction === 'down' ? '↓' : '→'} {value} vs {label}</span>;
}

export function AnalyticsGrid({ data, personal = false, scopeLabel, scopeCaveat }: { data: AnalyticsSnapshot; personal?: boolean; scopeLabel?: string; scopeCaveat?: string }) {
  const tokenCaptured = data.token.counterStatus === 'captured';
  const tokenComparable = tokenCaptured || data.token.counterStatus === 'no_sessions';
  const cards = [
    { label: 'Merged PRs', value: String(data.delivery.mergedPrs), detail: 'GitHub · selected period', current: data.delivery.mergedPrs, previous: data.comparison.delivery.mergedPrs },
    { label: 'AI-linked PRs', value: `${data.delivery.aiAssistedPrs}${data.delivery.aiPrRate === null ? '' : ` · ${number.format(data.delivery.aiPrRate)}%`}`, detail: `${data.delivery.verifiedLinkedPrs} exact verified links`, current: data.delivery.aiAssistedPrs, previous: data.comparison.delivery.aiAssistedPrs },
    { label: 'Total tokens', value: tokenComparable ? compact.format(data.token.total) : counterLabel(data.token.counterStatus), detail: `${data.token.sessions} opted-in sessions`, current: tokenComparable ? data.token.total : null, previous: data.comparison.token.total },
    { label: 'Average tokens / PR', value: data.delivery.avgTokensPerMergedPr === null ? 'Unavailable' : compact.format(data.delivery.avgTokensPerMergedPr), detail: 'Captured token counters ÷ merged PRs', current: data.delivery.avgTokensPerMergedPr, previous: data.comparison.delivery.avgTokensPerMergedPr },
    { label: 'Average merge time', value: data.delivery.avgMergeHours === null ? 'Unavailable' : `${number.format(data.delivery.avgMergeHours)}h`, detail: 'Created → merged, real PRs only', current: data.delivery.avgMergeHours, previous: data.comparison.delivery.avgMergeHours },
    { label: 'USD consumption', value: data.token.costUsd === null ? 'Unavailable' : `$${data.token.costUsd.toFixed(2)}`, detail: data.token.costUsd === null ? 'Provider cost absent; no estimate substituted' : 'Provider-reported session cost', current: data.token.costUsd, previous: data.comparison.token.costUsd },
  ];
  return <section className="analytics-section"><div className="section-heading"><div><span className="page-kicker">{personal ? 'Your operating signals' : 'Management operating signals'}</span><h2>Delivery, adoption, and consumption</h2>{scopeLabel ? <p>{scopeLabel}</p> : null}{scopeCaveat ? <p className="analytics-caveat">{scopeCaveat}</p> : null}</div><span className="count-badge">real inputs · {data.comparison.windowLabel}</span></div>
    <div className="analytics-grid">{cards.map((card) => <article key={card.label}><small>{card.label}</small><strong>{card.value}</strong><ComparisonBadge current={card.current} previous={card.previous} available={data.comparison.available} label={data.comparison.label} /><p>{card.detail}</p>{card.label === 'AI-linked PRs' && data.delivery.aiPrRate !== null ? <ComparisonBadge current={data.delivery.aiPrRate} previous={data.comparison.delivery.aiPrRate} available={data.comparison.available} label={data.comparison.label} unit="points" /> : null}</article>)}</div>
    <div className="analytics-breakdown"><article><div className="cardhead"><h3>Token mix</h3><span className="sub">provider counters</span></div><div className="token-mix">{([
      ['input', data.token.input, data.comparison.token.input],
      ['output', data.token.output, data.comparison.token.output],
      ['cache read', data.token.cacheRead, data.comparison.token.cacheRead],
      ['cache create', data.token.cacheCreation, data.comparison.token.cacheCreation],
    ] as const).map(([label, current, previous]) => <span key={label}><b>{tokenComparable ? compact.format(current) : '—'}</b>{label}<ComparisonBadge current={tokenComparable ? current : null} previous={previous} available={data.comparison.available} label={data.comparison.label} /></span>)}</div>
      {data.token.providers.map((provider) => <div className="provider-row" key={`${provider.provider}:${provider.model}`}><span><strong>{provider.provider}</strong><small>{provider.model}</small></span><span className="provider-token-value"><b>{provider.counterStatus === 'captured' ? `${compact.format(provider.totalTokens)} tokens` : counterLabel(provider.counterStatus)}</b><ComparisonBadge current={provider.counterStatus === 'captured' || provider.counterStatus === 'no_sessions' ? provider.totalTokens : null} previous={provider.previousTotalTokens} available={data.comparison.available} label={data.comparison.label} /></span><span className="provider-session-value"><em>{provider.sessions} sessions</em><ComparisonBadge current={provider.sessions} previous={provider.previousSessions} available={data.comparison.available} label={data.comparison.label} unit="absolute" /></span></div>)}</article>
      <article><div className="cardhead"><h3>PR shape</h3><span className="sub">persisted deterministic buckets</span></div><div className="size-buckets">{(['S','M','L'] as const).map((size) => <span key={size}><b>{data.delivery.sizeBuckets[size]}</b>{size} changes<ComparisonBadge current={data.delivery.sizeBuckets[size]} previous={data.comparison.delivery.sizeBuckets[size]} available={data.comparison.available} label={data.comparison.label} unit="absolute" /></span>)}</div><p className="analytics-note">{data.delivery.unclassifiedPrs ? `${data.delivery.unclassifiedPrs} merged PR${data.delivery.unclassifiedPrs === 1 ? ' is' : 's are'} awaiting persisted size-bucket evidence. ` : ''}A semantic “PR type” is not shown because no deterministic classifier exists yet.</p></article></div>
  </section>;
}

export function MovementExplainer({ movement, filtered = false }: { movement: AnalyticsSnapshot['movement']; filtered?: boolean }) {
  return <section className="card movement-card"><div className="cardhead"><div><span className="page-kicker">Deterministic delta decomposition</span><h3>Why the index moved</h3></div><span className="sub">stored L2 change × active weight</span></div>
    {filtered ? <p className="movement-filter-note">Operating filters do not recompute this published organization index.</p> : null}
    {movement.delta === null ? <div className="movement-empty"><strong>No comparable prior score yet</strong><p>The current index is real, but a change explanation needs a scored baseline for the selected period. Prism will not invent one.</p></div> : <><div className="movement-total"><span>{movement.previous?.toFixed(1)} <i>→</i> {movement.current?.toFixed(1)}</span><strong>{movement.delta >= 0 ? '+' : ''}{movement.delta.toFixed(1)} points</strong></div><div className="movement-rows">{movement.contributions.map((row) => <div key={row.dimension}><span>{row.dimension}</span><small>{row.from?.toFixed(1) ?? '—'} → {row.to?.toFixed(1) ?? '—'}</small><b>{row.weightedPoints === null ? 'not comparable' : `${row.weightedPoints >= 0 ? '+' : ''}${row.weightedPoints.toFixed(2)} pts`}</b></div>)}</div>{movement.configChanged || movement.confidenceChanged ? <p className="movement-warning">Separate measurement effect: {movement.configChanged ? 'configuration version changed. ' : ''}{movement.confidenceChanged ? 'confidence band changed.' : ''}</p> : null}</>}
  </section>;
}
