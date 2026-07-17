import type { ReactNode } from 'react';

export function PageHeader({
  kicker,
  title,
  description,
  actions,
  meta,
}: {
  kicker: string;
  title: string;
  description: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-heading">
        <span className="page-kicker">{kicker}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
      {meta ? <div className="meta-row">{meta}</div> : null}
    </header>
  );
}

export function MetaChip({ label, value, tone }: { label: string; value: ReactNode; tone?: 'accent' | 'warning' }) {
  return (
    <span className={`meta-chip${tone ? ` ${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </span>
  );
}
