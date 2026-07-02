// components/panels/ChangeList.tsx
//
// "What moved the index" — a faithful port of the `.chg` / `.chgitem` block from the
// approved design. Each driver is an up/dn icon, a title + explanatory body, and a
// signed amount. Renders an EmptyState when there are no drivers yet (no fabricated
// movement).

import { EmptyState } from '@/components/ui/EmptyState';
import type { DriverDTO } from '@/lib/ui/view-models';

export interface ChangeListProps {
  drivers: DriverDTO[];
}

export function ChangeList({ drivers }: ChangeListProps) {
  if (drivers.length === 0) {
    return (
      <EmptyState
        compact
        title="Awaiting signal"
        hint="index movement is attributed once two windows can be compared"
      />
    );
  }

  return (
    <div className="chg">
      {drivers.map((d, i) => (
        <div className="chgitem" key={`${d.title}-${i}`}>
          <span className={`ic ${d.dir}`}>{d.dir === 'up' ? '↑' : '↓'}</span>
          <span className="ct">
            <b>{d.title}</b>
            {d.body ? <> — {d.body}</> : null}
          </span>
          <span className={`amt ${d.amountDir}`}>{d.amountLabel}</span>
        </div>
      ))}
    </div>
  );
}
