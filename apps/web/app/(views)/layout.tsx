// app/(views)/layout.tsx
//
// Pass-through layout for the data views (Function / Team / Team member). Each page now
// owns its own `.top` header (view title + PeriodToggle) and `.main` frame, mirroring
// the approved design's per-section headers — so there is no global MetaStrip /
// PeriodToggle here. This layout exists only to scope the route group; it renders its
// children unchanged.

import type { ReactNode } from 'react';

export default function ViewsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
