// components/panels/CommsLog.tsx
//
// "Communications & actions sent" — a faithful port of the `.commlog` / `.commitem`
// block from the approved design (Member detail). Each entry is a date, the action
// (with the channel it was sent via), and a status chip keyed to the design's
// `.st-*` colors. Renders an EmptyState when no nudges have been sent yet.

import { EmptyState } from '@/components/ui/EmptyState';
import type { CommsEntryDTO } from '@/lib/ui/view-models';

export interface CommsLogProps {
  entries: CommsEntryDTO[];
}

/** Status → the design's `.st-*` class. */
const STATUS_CLASS: Record<CommsEntryDTO['status'], string> = {
  adopted: 'st-adopted',
  prog: 'st-prog',
  ack: 'st-ack',
  dismiss: 'st-dismiss',
  course: 'st-course',
};

export function CommsLog({ entries }: CommsLogProps) {
  if (entries.length === 0) {
    return (
      <EmptyState
        compact
        title="No nudges sent"
        hint="coaching nudges and assigned actions show up here once delivered"
      />
    );
  }

  return (
    <div className="commlog">
      {entries.map((e, i) => (
        <div className="commitem" key={`${e.dateLabel}-${i}`}>
          <span className="dt">{e.dateLabel}</span>
          <div className="ax">
            <b>{e.action}</b>
            <small>sent via {e.channel}</small>
          </div>
          <span className={`stchip ${STATUS_CLASS[e.status] ?? 'st-ack'}`}>{e.statusLabel}</span>
        </div>
      ))}
    </div>
  );
}
