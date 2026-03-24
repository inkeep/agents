'use client';

import { MCPToolImage } from '@/components/mcp-servers/mcp-tool-image';
import {
  ItemCardContent,
  ItemCardHeader,
  ItemCardRoot,
  ItemCardTitle,
} from '@/components/ui/item-card';
import { URLDisplay } from '@/components/url-display';
import type { PrebuiltMCPServer } from '@/lib/data/prebuilt-mcp-servers';
import { cn } from '@/lib/utils';

interface PrebuiltServerCardProps {
  server: PrebuiltMCPServer;
  onSelect: (server: PrebuiltMCPServer) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export function PrebuiltServerCard({
  server,
  onSelect,
  isLoading = false,
  disabled = false,
}: PrebuiltServerCardProps) {
  const handleClick = () => {
    if (!isLoading && !disabled) {
      onSelect(server);
    }
  };

  return (
    <ItemCardRoot
      className={cn(
        'h-full min-w-0 transition-shadow',
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'cursor-pointer hover:shadow-md hover:bg-accent/50'
      )}
      onClick={handleClick}
    >
      <ItemCardHeader>
        <ItemCardTitle className="text-md flex items-center gap-3 min-w-0">
          <MCPToolImage
            imageUrl={server.imageUrl}
            name={server.name}
            size={24}
            className="mt-0.5 flex-shrink-0"
          />
          <span className="font-medium break-all">{server.name}</span>
        </ItemCardTitle>
      </ItemCardHeader>
      <ItemCardContent>
        <URLDisplay>{server.url}</URLDisplay>
      </ItemCardContent>
    </ItemCardRoot>
  );
}
