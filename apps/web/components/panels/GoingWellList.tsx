// components/panels/GoingWellList.tsx
//
// "What's going well — and why" — a faithful port of the `.well` / `.wellitem` block
// from the approved design (Member detail / My view). Each item is a category-hued
// icon, a title, and a cause→effect line. The cause string may contain emphasized
// `<em>` fragments (the agent narrative wraps the changed metric); we render ONLY the
// `cause` string as HTML so those `<em>` spans pick up the design's `.cause em`
// styling. Title and category are rendered as plain text. Empty → the "Building
// signal" placeholder from the design.

import type { WellItemDTO } from '@/lib/ui/view-models';

export interface GoingWellListProps {
  items: WellItemDTO[];
}

/** Category → [css class, glyph], matching the design's catMap. */
const CATEGORY_META: Record<WellItemDTO['category'], [string, string]> = {
  prompt: ['prompt', '✎'],
  skill: ['skill', '✦'],
  waste: ['waste', '↓'],
  qual: ['qual', '✓'],
};

export function GoingWellList({ items }: GoingWellListProps) {
  if (items.length === 0) {
    return (
      <div className="well">
        <div className="wellitem">
          <span className="cat qual">·</span>
          <div className="tx">
            <b>Building signal</b>
            <span className="cause">Not enough movement yet to attribute a win.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="well">
      {items.map((it, i) => {
        const [catClass, glyph] = CATEGORY_META[it.category] ?? CATEGORY_META.qual;
        return (
          <div className="wellitem" key={`${it.title}-${i}`}>
            <span className={`cat ${catClass}`}>{glyph}</span>
            <div className="tx">
              <b>{it.title}</b>
              {/* cause may contain <em> fragments — render ONLY this string as HTML. */}
              <span className="cause" dangerouslySetInnerHTML={{ __html: it.cause }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
