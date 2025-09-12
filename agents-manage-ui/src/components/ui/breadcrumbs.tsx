import Link from 'next/link';

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  if (!items?.length) return null;
  return (
    <nav className="text-sm text-muted-foreground" aria-label="Breadcrumb">
      <ol className="flex items-center gap-2">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <li key={`${item.label}-${idx}`} className="flex items-center gap-2">
              {item.href && !isLast ? (
                <Link href={item.href} className="hover:text-foreground">
                  {item.label}
                </Link>
              ) : (
                <span className={isLast ? 'font-medium text-foreground' : ''}>{item.label}</span>
              )}
              {!isLast && <span className="text-muted-foreground/60">›</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
