import Link from 'next/link';
import { DefaultEmptyStateIcon } from '@/components/icons/empty-state/default';
import { Button } from '../ui/button';

interface EmptyStateProps {
  title: string | React.ReactNode;
  description: string | React.ReactNode;
  link?: string;
  linkText?: string;
  icon?: React.ReactNode;
  bgColor?: string;
  action?: React.ReactNode;
}

function EmptyState({
  title,
  description,
  link,
  linkText,
  icon,
  bgColor,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="flex flex-col items-center justify-center gap-6 max-w-md">
        <div className="relative max-w-80 max-h-48 mx-auto mb-2">
          {icon || <DefaultEmptyStateIcon />}
          <div
            className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent"
            style={
              bgColor
                ? {
                    background: `linear-gradient(to top, ${bgColor}, transparent)`,
                  }
                : undefined
            }
          />
        </div>
        <div className="flex flex-col items-center justify-center gap-1">
          <h1 className="text-lg font-light">{title}</h1>
          <p className="text-sm text-muted-foreground text-center">{description}</p>
        </div>

        {link && (
          <Button asChild>
            <Link href={link}>{linkText}</Link>
          </Button>
        )}
        {action}
      </div>
    </div>
  );
}

export default EmptyState;
