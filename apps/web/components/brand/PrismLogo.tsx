// components/brand/PrismLogo.tsx
//
// The Prism mark: one white beam enters a triangular prism and refracts into the four
// dimension hues (Usage / Efficiency / Effectiveness / Proficiency). Hues are read
// from app/tokens.ts so the logo, chips, and charts share one typed color source.
// "One light · four signals."

import { DIMENSION_HUES, INK } from '@/app/tokens';

export interface PrismLogoProps {
  size?: number;
  title?: string;
}

export function PrismLogo({ size = 28, title = 'Prism' }: PrismLogoProps) {
  // viewBox 0..48; the prism triangle sits center; the incoming beam comes from the
  // left, the four rays fan out to the right at slightly different angles.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>

      {/* incoming white beam */}
      <line x1="2" y1="24" x2="18" y2="24" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />

      {/* refracted rays — fanned from the prism's right face */}
      <line x1="30" y1="24" x2="46" y2="12" stroke={DIMENSION_HUES.usage} strokeWidth="2.2" strokeLinecap="round" />
      <line x1="30" y1="24" x2="46" y2="20" stroke={DIMENSION_HUES.efficiency} strokeWidth="2.2" strokeLinecap="round" />
      <line x1="30" y1="24" x2="46" y2="28" stroke={DIMENSION_HUES.effectiveness} strokeWidth="2.2" strokeLinecap="round" />
      <line x1="30" y1="24" x2="46" y2="36" stroke={DIMENSION_HUES.proficiency} strokeWidth="2.2" strokeLinecap="round" />

      {/* the prism triangle */}
      <path
        d="M18 32 L30 24 L18 16 Z"
        fill="none"
        stroke={INK}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {/* faint internal fill to suggest the glass */}
      <path d="M18 32 L30 24 L18 16 Z" fill={INK} fillOpacity="0.06" />
    </svg>
  );
}
