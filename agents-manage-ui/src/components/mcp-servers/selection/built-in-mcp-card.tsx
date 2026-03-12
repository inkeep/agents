'use client';

import { MCPToolImage } from '@/components/mcp-servers/mcp-tool-image';
import {
  ItemCardContent,
  ItemCardHeader,
  ItemCardRoot,
  ItemCardTitle,
} from '@/components/ui/item-card';

interface BuiltInMcpCardProps {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  tools: readonly string[];
  onSelect: (id: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export function BuiltInMcpCard({
  id,
  name,
  description,
  imageUrl,
  tools,
  onSelect,
  isLoading = false,
  disabled = false,
}: BuiltInMcpCardProps) {
  const handleClick = () => {
    if (!isLoading && !disabled) {
      onSelect(id);
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
          <MCPToolImage
            imageUrl={imageUrl}
            name={name}
            size={24}
            className="mt-0.5 flex-shrink-0"
          />
          <span className="flex-1 min-w-0 text-base font-medium truncate">{name}</span>
        </ItemCardTitle>
      </ItemCardHeader>

      <ItemCardContent>
        <div className="space-y-2 min-w-0">
          <p className="text-sm text-muted-foreground">{description}</p>
          <p className="text-xs text-muted-foreground">{tools.length} tools</p>
        </div>
      </ItemCardContent>
    </ItemCardRoot>
  );
}
