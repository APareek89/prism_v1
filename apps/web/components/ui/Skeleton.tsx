// components/ui/Skeleton.tsx
//
// Loading shimmer block for Suspense fallbacks (app/loading.tsx). Respects
// reduced-motion via the global media query (it kills the animation).

import type { CSSProperties } from 'react';

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  style?: CSSProperties;
}

export function Skeleton({ width = '100%', height = 14, radius = 6, style }: SkeletonProps) {
  return (
    <span
      aria-hidden
      style={{
        display: 'block',
        width,
        height,
        borderRadius: radius,
        background:
          'linear-gradient(90deg, var(--panel2) 25%, var(--line2) 37%, var(--panel2) 63%)',
        backgroundSize: '400% 100%',
        animation: 'prism-shimmer 1.4s ease infinite',
        ...style,
      }}
    >
      <style>{`
        @keyframes prism-shimmer {
          0% { background-position: 100% 0; }
          100% { background-position: 0 0; }
        }
      `}</style>
    </span>
  );
}
