// components/panels/SpectrumPanel.tsx
//
// The four `.subrow` spectrum bars — a faithful port of `.card.spectrum` from the
// approved design. Each row is a dimension-hued square + label + a small line
// (weight on the Function view, "vs squad NN" on Member/My view) + a `.track` fill at
// score% + a `.subval` value with its delta. Per-bar empty treatment when score is
// null (no fabricated fill). Shared by Function, Member detail and My view; props are
// fixed by the M1 contract and must not change.

import { DIMENSION_HUES } from '@/app/tokens';
import { fmtScore } from '@/lib/format';
import type { L2DTO } from '@/lib/ui/view-models';

export interface SpectrumPanelProps {
  spectrum: L2DTO[];
  /** When true the small line reads "vs squad NN" instead of the weight. */
  showVsSquad?: boolean;
}

/** Map a DeltaDir to the design's `.delta` modifier class (up/dn/flat). */
function deltaClass(dir: 'up' | 'down' | 'flat'): string {
  return dir === 'up' ? 'up' : dir === 'down' ? 'dn' : 'flat';
}

export function SpectrumPanel({ spectrum, showVsSquad = false }: SpectrumPanelProps) {
  return (
    <div className="card spectrum">
      {spectrum.map((l2) => {
        const hue = DIMENSION_HUES[l2.dimension];
        const hasSignal = l2.score !== null && l2.minSignalMet;
        // Width is the score% — clamped 0–100. When there's no signal the track stays
        // empty (0%) rather than rendering a fabricated bar.
        const width = hasSignal ? Math.max(0, Math.min(100, l2.score ?? 0)) : 0;

        const small = showVsSquad
          ? l2.vsSquad !== null
            ? `vs squad ${fmtScore(l2.vsSquad)}`
            : 'vs squad —'
          : `weight ${l2.weightPct}%`;

        return (
          <div className="subrow" key={l2.dimension}>
            <div className="lab">
              <i style={{ background: hue }} />
              <div>
                {l2.label}
                <small>{small}</small>
              </div>
            </div>
            <div className="track">
              <i style={{ width: `${width}%`, background: hue }} />
            </div>
            <div className="subval">
              <b>{fmtScore(l2.score)}</b>
              {hasSignal && l2.delta ? (
                <span className={`d delta ${deltaClass(l2.delta.dir)}`}>{l2.delta.label}</span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
