// app/loading.tsx
//
// Suspense fallback skeleton for the app shell's main column.

import { Skeleton } from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* meta strip placeholder */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          padding: '18px 24px',
          borderBottom: '1px solid var(--line)',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton width={180} height={22} />
          <Skeleton width={120} height={12} />
        </div>
        <Skeleton width={180} height={32} radius={999} />
      </div>

      {/* body placeholders */}
      <div style={{ padding: 24, display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="panel"
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <Skeleton width={140} height={14} />
            <Skeleton height={64} radius={10} />
            <Skeleton width="60%" height={12} />
          </div>
        ))}
      </div>
    </div>
  );
}
