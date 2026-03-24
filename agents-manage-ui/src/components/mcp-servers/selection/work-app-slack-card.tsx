'use client';

import { Slack } from 'lucide-react';
import {
  ItemCardContent,
  ItemCardHeader,
  ItemCardRoot,
  ItemCardTitle,
} from '@/components/ui/item-card';

interface WorkAppSlackCardProps {
  onClick: () => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export function WorkAppSlackCard({
  onClick,
  isLoading = false,
  disabled = false,
}: WorkAppSlackCardProps) {
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
          <Slack className="h-6 w-6 flex-shrink-0" />
          <span className="flex-1 min-w-0 text-base font-medium truncate">Slack</span>
        </ItemCardTitle>
      </ItemCardHeader>

      <ItemCardContent>
        <p className="text-sm text-muted-foreground">
          Post messages to Slack channels and DMs with access controls
        </p>
      </ItemCardContent>
    </ItemCardRoot>
  );
}
