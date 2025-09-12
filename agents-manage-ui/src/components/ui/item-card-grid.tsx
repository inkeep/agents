import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  ItemCardContent,
  ItemCardDescription,
  ItemCardFooter,
  ItemCardHeader,
  ItemCardLink,
  ItemCardRoot,
  ItemCardTitle,
} from './item-card';

export interface ItemCardGridProps<T> {
  /** Array of items to render as cards */
  items: T[];
  /** Function to extract a unique key from each item */
  getKey: (item: T) => string | number;
  /** Optional href function for each card (use for server-side navigation with LinkCard) */
  getHref?: (item: T) => string;
  /** Optional function to get the description for each card */
  getDescription?: (item: T) => string | ReactNode;
  /** Optional function to get the footer text for each card */
  getFooterText?: (item: T) => string;
  /** Render function for the card header content */
  renderHeader?: (item: T) => ReactNode;
  /** Render function for custom card content (bypasses description/footer structure) */
  renderContent?: (item: T) => ReactNode;
  /** Optional custom grid className (defaults to responsive 2-3 column grid) */
  gridClassName?: string;
  /** Optional className for individual cards */
  cardClassName?: string;
}

export function ItemCardGrid<T>({
  items,
  getKey,
  getHref,
  getDescription,
  getFooterText,
  renderHeader,
  renderContent,
  gridClassName = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4',
  cardClassName,
}: ItemCardGridProps<T>) {
  return (
    <div className={gridClassName}>
      {items.map((item) => {
        const cardHeader = (
          <ItemCardHeader>
            <ItemCardTitle className="text-md">
              {renderHeader ? renderHeader(item) : getKey(item)}
            </ItemCardTitle>
            {/* Dialogue button can go here */}
          </ItemCardHeader>
        );

        const cardContent = renderContent ? (
          <ItemCardContent>
            {renderContent(item)}
            <ItemCardFooter footerText={getFooterText ? getFooterText(item) : ''} />
          </ItemCardContent>
        ) : (
          <ItemCardContent>
            <ItemCardDescription hasContent={!!getDescription} className="line-clamp-2">
              {getDescription ? getDescription(item) : ''}
            </ItemCardDescription>
            <ItemCardFooter footerText={getFooterText ? getFooterText(item) : ''} />
          </ItemCardContent>
        );

        const fullCardContent = (
          <>
            {getHref ? <ItemCardLink href={getHref(item)}>{cardHeader}</ItemCardLink> : cardHeader}
            {getHref ? (
              <ItemCardLink href={getHref(item)} className="group flex h-full">
                {cardContent}
              </ItemCardLink>
            ) : (
              cardContent
            )}
          </>
        );

        return (
          <ItemCardRoot key={getKey(item)} className={cn('h-full min-w-0', cardClassName)}>
            {fullCardContent}
          </ItemCardRoot>
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
