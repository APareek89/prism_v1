import { Skeleton } from '@/components/ui/Skeleton';

/** Immediate route-group fallback while a data-heavy server view is streaming. */
export default function ViewsLoading() {
  return <div className="page route-loading" aria-label="Loading view" aria-live="polite">
    <div className="route-loading-header"><Skeleton width={110} height={10} /><Skeleton width="58%" height={38} /><Skeleton width="72%" height={15} /></div>
    <div className="route-loading-meta">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} width={125} height={30} radius={8} />)}</div>
    <div className="hero"><div className="card"><Skeleton width={150} height={12} /><Skeleton width={120} height={70} /><Skeleton width="65%" height={13} /></div><div className="card route-loading-bars">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} height={24} radius={8} />)}</div></div>
  </div>;
}
