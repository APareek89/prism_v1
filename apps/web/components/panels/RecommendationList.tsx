// components/panels/RecommendationList.tsx
//
// "Recommended for you" (My view). Faithful port of the design's `.ins` list of
// `.insitem` rows: a `✦` marker in the `.n` slot, the recommendation title + body in
// `.tx`, and a trailing dimension `.tag2` whose text is the recommendation kind
// (skill · process · course). Renders an EmptyState when the list is empty — no
// fabricated recommendations.
//
// Server Component (read-only).

import type { RecommendationDTO } from '@/lib/ui/view-models';
import { EmptyState } from '@/components/ui/EmptyState';

export interface RecommendationListProps {
  recommendations: RecommendationDTO[];
}

export function RecommendationList({ recommendations }: RecommendationListProps) {
  if (recommendations.length === 0) {
    return (
      <EmptyState
        compact
        hint="recommendations appear after your first scored window — they're monitored for adoption"
      />
    );
  }

  return (
    <div className="ins">
      {recommendations.map((rec, i) => (
        <div className="insitem" key={`${rec.title}-${i}`}>
          <span className="n">{rec.marker}</span>
          <div className="tx">
            <b>{rec.title}</b>
            <small>{rec.body}</small>
          </div>
          <span className={`tag2 ${rec.tag}`}>{rec.kind}</span>
        </div>
      ))}
    </div>
  );
}
