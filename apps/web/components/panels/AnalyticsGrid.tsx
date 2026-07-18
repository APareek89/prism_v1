import type { AnalyticsSnapshot } from '@/lib/db/analytics';

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export function AnalyticsGrid({ data, personal = false, scopeLabel, scopeCaveat }: { data: AnalyticsSnapshot; personal?: boolean; scopeLabel?: string; scopeCaveat?: string }) {
  const cards = [
    ['Merged PRs', String(data.delivery.mergedPrs), 'GitHub · trailing 28 days'],
    ['AI-linked PRs', `${data.delivery.aiAssistedPrs}${data.delivery.aiPrRate === null ? '' : ` · ${number.format(data.delivery.aiPrRate)}%`}`, `${data.delivery.verifiedLinkedPrs} exact verified links`],
    ['Total tokens', compact.format(data.token.total), `${data.token.sessions} opted-in sessions`],
    ['Average tokens / PR', data.delivery.avgTokensPerMergedPr === null ? 'Unavailable' : compact.format(data.delivery.avgTokensPerMergedPr), 'All token counters ÷ merged PRs'],
    ['Average merge time', data.delivery.avgMergeHours === null ? 'Unavailable' : `${number.format(data.delivery.avgMergeHours)}h`, 'Created → merged, real PRs only'],
    ['USD consumption', data.token.costUsd === null ? 'Unavailable' : `$${data.token.costUsd.toFixed(2)}`, data.token.costUsd === null ? 'Provider cost absent; no estimate substituted' : 'Provider-reported session cost'],
  ];
  return <section className="analytics-section"><div className="section-heading"><div><span className="page-kicker">{personal ? 'Your operating signals' : 'Management operating signals'}</span><h2>Delivery, adoption, and consumption</h2>{scopeLabel ? <p>{scopeLabel}</p> : null}{scopeCaveat ? <p className="analytics-caveat">{scopeCaveat}</p> : null}</div><span className="count-badge">real inputs · up to 28 days</span></div>
    <div className="analytics-grid">{cards.map(([label, value, detail]) => <article key={label}><small>{label}</small><strong>{value}</strong><p>{detail}</p></article>)}</div>
    <div className="analytics-breakdown"><article><div className="cardhead"><h3>Token mix</h3><span className="sub">provider counters</span></div><div className="token-mix"><span><b>{compact.format(data.token.input)}</b>input</span><span><b>{compact.format(data.token.output)}</b>output</span><span><b>{compact.format(data.token.cacheRead)}</b>cache read</span><span><b>{compact.format(data.token.cacheCreation)}</b>cache create</span></div>{data.token.providers.map((provider) => <div className="provider-row" key={`${provider.provider}:${provider.model}`}><span><strong>{provider.provider}</strong><small>{provider.model}</small></span><b>{compact.format(provider.totalTokens)} tokens</b><em>{provider.sessions} sessions</em></div>)}</article>
      <article><div className="cardhead"><h3>PR shape</h3><span className="sub">persisted deterministic buckets</span></div><div className="size-buckets">{(['S','M','L'] as const).map((size) => <span key={size}><b>{data.delivery.sizeBuckets[size]}</b>{size} changes</span>)}</div><p className="analytics-note">{data.delivery.unclassifiedPrs ? `${data.delivery.unclassifiedPrs} merged PR${data.delivery.unclassifiedPrs === 1 ? ' is' : 's are'} awaiting persisted size-bucket evidence. ` : ''}A semantic “PR type” is not shown because no deterministic classifier exists yet.</p></article></div>
  </section>;
}

export function MovementExplainer({ movement, filtered = false }: { movement: AnalyticsSnapshot['movement']; filtered?: boolean }) {
  return <section className="card movement-card"><div className="cardhead"><div><span className="page-kicker">Deterministic delta decomposition</span><h3>Why the index moved</h3></div><span className="sub">stored L2 change × active weight</span></div>
    {filtered ? <p className="movement-filter-note">Operating filters do not recompute this published organization index.</p> : null}
    {movement.delta === null ? <div className="movement-empty"><strong>No comparable prior score yet</strong><p>The current index is real, but a change explanation needs at least two scored dates for the same scope. Prism will not invent a baseline.</p></div> : <><div className="movement-total"><span>{movement.previous?.toFixed(1)} <i>→</i> {movement.current?.toFixed(1)}</span><strong>{movement.delta >= 0 ? '+' : ''}{movement.delta.toFixed(1)} points</strong></div><div className="movement-rows">{movement.contributions.map((row) => <div key={row.dimension}><span>{row.dimension}</span><small>{row.from?.toFixed(1) ?? '—'} → {row.to?.toFixed(1) ?? '—'}</small><b>{row.weightedPoints === null ? 'not comparable' : `${row.weightedPoints >= 0 ? '+' : ''}${row.weightedPoints.toFixed(2)} pts`}</b></div>)}</div>{movement.configChanged || movement.confidenceChanged ? <p className="movement-warning">Separate measurement effect: {movement.configChanged ? 'configuration version changed. ' : ''}{movement.confidenceChanged ? 'confidence band changed.' : ''}</p> : null}</>}
  </section>;
}
