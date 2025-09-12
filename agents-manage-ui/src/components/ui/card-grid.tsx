import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ClickableCard } from '@/components/ui/clickable-card';
import { cn } from '@/lib/utils';

export interface CardGridProps<T> {
  /** Array of items to render as cards */
  items: T[];
  /** Function to extract a unique key from each item */
  getKey: (item: T) => string | number;
  /** Optional href function for each card (use for server-side navigation with LinkCard) */
  getHref?: (item: T) => string;
  /** Render function for the card header content */
  renderHeader: (item: T) => ReactNode;
  /** Render function for the card content */
  renderContent: (item: T) => ReactNode;
  /** Optional custom grid className (defaults to responsive 2-3 column grid) */
  gridClassName?: string;
  /** Optional className for individual cards */
  cardClassName?: string;
}

export function CardGrid<T>({
  items,
  getKey,
  getHref,
  renderHeader,
  renderContent,
  gridClassName = 'grid gap-4 md:grid-cols-2 lg:grid-cols-3 items-stretch',
  cardClassName,
}: CardGridProps<T>) {
  return (
    <div className={gridClassName}>
      {items.map((item) => {
        const cardContent = (
          <>
            <CardHeader className="pb-4 px-4">{renderHeader(item)}</CardHeader>
            <CardContent className="space-y-3 px-4">{renderContent(item)}</CardContent>
          </>
        );

        if (getHref) {
          return (
            <Link key={getKey(item)} href={getHref(item)}>
              <ClickableCard className={cn('h-full', cardClassName)}>{cardContent}</ClickableCard>
            </Link>
          );
        }

        return (
          <Card key={getKey(item)} className={cn('h-full', cardClassName)}>
            {cardContent}
          </Card>
        );
      })}
    </div>
  );
}

// Convenience type for simple card data with id
export interface CardItem {
  id: string | number;
  [key: string]: any;
}

// Helper function for items that have an id property
export const getItemId = <T extends CardItem>(item: T): string | number => item.id;
