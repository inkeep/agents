'use client';

import { Github } from 'lucide-react';
import {
  ItemCardContent,
  ItemCardHeader,
  ItemCardRoot,
  ItemCardTitle,
} from '@/components/ui/item-card';

interface WorkAppGitHubCardProps {
  onClick: () => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export function WorkAppGitHubCard({
  onClick,
  isLoading = false,
  disabled = false,
}: WorkAppGitHubCardProps) {
  const handleClick = () => {
    if (!isLoading && !disabled) {
      onClick();
    }
  };

  return (
    <ItemCardRoot
      className={`h-full min-w-0 transition-shadow ${
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'cursor-pointer hover:shadow-md hover:bg-accent/50'
      }`}
      onClick={handleClick}
    >
      <ItemCardHeader>
        <ItemCardTitle className="text-md flex items-center gap-3 min-w-0">
          <Github className="h-6 w-6 flex-shrink-0" />
          <span className="flex-1 min-w-0 text-base font-medium truncate">GitHub</span>
        </ItemCardTitle>
      </ItemCardHeader>

      <ItemCardContent>
        <p className="text-sm text-muted-foreground">
          Access GitHub repositories with secure authentication
        </p>
      </ItemCardContent>
    </ItemCardRoot>
  );
}
