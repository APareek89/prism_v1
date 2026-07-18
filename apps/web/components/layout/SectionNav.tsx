import Link from 'next/link';

export interface SectionNavItem {
  href: string;
  label: string;
  description: string;
  active: boolean;
}

export function SectionNav({ label, items }: { label: string; items: SectionNavItem[] }) {
  return <nav className="section-nav" aria-label={label}>
    <span className="section-nav-label">{label}</span>
    {items.map((item) => <Link key={item.href} href={item.href} className={item.active ? 'active' : ''} aria-current={item.active ? 'page' : undefined}>
      <i />
      <span><strong>{item.label}</strong><small>{item.description}</small></span>
    </Link>)}
  </nav>;
}
