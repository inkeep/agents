import { forwardRef, type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface ClickableCardProps extends Omit<React.ComponentProps<typeof Card>, 'onClick'> {
  /**
   * Callback when the card is clicked (optional when used with Link wrapper)
   */
  onClick?: () => void;
  /**
   * Card content
   */
  children: ReactNode;
  /**
   * Whether the card is disabled
   */
  disabled?: boolean;
  /**
   * Custom hover border color (defaults to primary)
   */
  hoverBorderVariant?: 'primary' | 'muted';
}

/**
 * A reusable clickable card component with consistent hover styling
 * Used across the app for navigation cards, selection cards, etc.
 */
export const ClickableCard = forwardRef<HTMLDivElement, ClickableCardProps>(
  (
    { onClick, children, disabled = false, hoverBorderVariant = 'primary', className, ...props },
    ref
  ) => {
    const handleClick = onClick
      ? () => {
          if (!disabled) {
            onClick();
          }
        }
      : undefined;

    return (
      <Card
        ref={ref}
        className={cn(
          'transition-all group',
          'gap-0',
          !disabled && [
            'cursor-pointer hover:shadow-md',
            hoverBorderVariant === 'primary'
              ? 'hover:border-primary'
              : 'hover:border-muted-foreground/20',
          ],
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
        onClick={handleClick}
        {...props}
      >
        {children}
      </Card>
    );
  }
);

ClickableCard.displayName = 'ClickableCard';
