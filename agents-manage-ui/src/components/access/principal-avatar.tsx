'use client';

import { Bot, Key, Users, Workflow } from 'lucide-react';
import type { FC } from 'react';
import { cn } from '@/lib/utils';
import type { AccessPrincipal, PrincipalType } from './types';

interface PrincipalAvatarProps {
  principal: AccessPrincipal;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  xs: 'size-5 text-[10px]',
  sm: 'size-6 text-xs',
  md: 'size-8 text-sm',
  lg: 'size-10 text-base',
};

const iconSizes = {
  xs: 'size-2.5',
  sm: 'size-3',
  md: 'size-4',
  lg: 'size-5',
};

function getIconForType(type: PrincipalType, size: 'xs' | 'sm' | 'md' | 'lg') {
  const iconClass = cn(iconSizes[size], 'text-muted-foreground');

  switch (type) {
    case 'group':
      return <Users className={iconClass} />;
    case 'service_account':
      return <Key className={iconClass} />;
    case 'agent':
      return <Bot className={iconClass} />;
    case 'workflow':
      return <Workflow className={iconClass} />;
    default:
      return null;
  }
}

function getBackgroundForType(type: PrincipalType): string {
  switch (type) {
    case 'user':
      return 'bg-muted';
    case 'group':
      return 'bg-blue-100 dark:bg-blue-900/30';
    case 'service_account':
      return 'bg-amber-100 dark:bg-amber-900/30';
    case 'agent':
      return 'bg-purple-100 dark:bg-purple-900/30';
    case 'workflow':
      return 'bg-green-100 dark:bg-green-900/30';
    default:
      return 'bg-muted';
  }
}

/**
 * Avatar component that adapts to different principal types.
 * - Users: Shows initials
 * - Groups: Shows group icon
 * - Service Accounts: Shows key icon
 * - Agents: Shows bot icon
 * - Workflows: Shows workflow icon
 */
export const PrincipalAvatar: FC<PrincipalAvatarProps> = ({
  principal,
  size = 'md',
  className,
}) => {
  const baseClasses = cn(
    'rounded-full flex items-center justify-center font-medium shrink-0',
    sizeClasses[size],
    getBackgroundForType(principal.type),
    className
  );

  // For users, show initials
  if (principal.type === 'user') {
    const initials =
      principal.displayName?.charAt(0)?.toUpperCase() ||
      principal.subtitle?.charAt(0)?.toUpperCase() ||
      '?';

    return <div className={baseClasses}>{initials}</div>;
  }

  // For non-user types, show appropriate icon
  const icon = getIconForType(principal.type, size);

  return <div className={baseClasses}>{icon}</div>;
};
