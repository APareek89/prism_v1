import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'overview'
  | 'people'
  | 'sparkles'
  | 'plug'
  | 'sliders'
  | 'arrow-right'
  | 'arrow-left'
  | 'shield'
  | 'trend'
  | 'target'
  | 'activity'
  | 'search'
  | 'check'
  | 'bolt'
  | 'book'
  | 'refresh'
  | 'info';

const paths: Record<IconName, ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  people: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  sparkles: <><path d="m12 3-1.1 3.2a7 7 0 0 1-4.4 4.4L3 12l3.5 1.4a7 7 0 0 1 4.4 4.4L12 21l1.1-3.2a7 7 0 0 1 4.4-4.4L21 12l-3.5-1.4a7 7 0 0 1-4.4-4.4L12 3Z"/></>,
  plug: <><path d="M12 22v-5"/><path d="M9 8V2M15 8V2"/><path d="M18 8v4a6 6 0 0 1-12 0V8Z"/><path d="M4 8h16"/></>,
  sliders: <><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/></>,
  'arrow-right': <><path d="M5 12h14M13 6l6 6-6 6"/></>,
  'arrow-left': <><path d="M19 12H5M11 18l-6-6 6-6"/></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
  trend: <><path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/></>,
  target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
  activity: <><path d="M3 12h4l2-7 4 14 2-7h6"/></>,
  search: <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></>,
  check: <><path d="m5 12 4 4L19 6"/></>,
  bolt: <><path d="m13 2-9 12h8l-1 8 9-12h-8l1-8Z"/></>,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></>,
  refresh: <><path d="M20 6v6h-6"/><path d="M4 18v-6h6"/><path d="M18.5 9a7 7 0 0 0-11.7-2.6L4 9M20 15l-2.8 2.6A7 7 0 0 1 5.5 15"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></>,
};

export function Icon({ name, size = 18, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
