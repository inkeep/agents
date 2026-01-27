'use client';

import { cn } from '@/lib/utils';
import { Badge } from '../ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

export function ActiveToolBadge({
  toolName,
  isAvailable,
}: {
  toolName: string;
  isAvailable: boolean;
}) {
  const badge = (
    <Badge
      variant={isAvailable ? 'primary' : 'warning'}
      className={cn(
        isAvailable ? '' : 'opacity-75 border-yellow-500 text-yellow-700 bg-yellow-50 normal-case'
      )}
    >
      {toolName}
    </Badge>
  );

  if (!isAvailable) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>
          <p>This tool is not available in the MCP server.</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return badge;
}

export function ItemLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('text-sm font-medium leading-none', className)}>{children}</div>;
}

export function ItemValue({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('flex w-full text-sm', className)}>{children}</div>;
}

export function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function isExpired(expiresAt: string | Date | null | undefined): boolean {
  if (!expiresAt) return false;
  const expirationDate = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  return expirationDate < new Date();
}

export function getStatusBadgeVariant(status: string) {
  switch (status) {
    case 'healthy':
      return 'success';
    case 'unhealthy':
      return 'error';
    case 'disabled':
      return 'code';
    case 'needs_auth':
    case 'unavailable':
      return 'warning';
    default:
      return 'warning';
  }
}
