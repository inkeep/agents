'use client';

import { MCPToolImage } from '@/components/mcp-servers/mcp-tool-image';
import {
  ItemCardContent,
  ItemCardHeader,
  ItemCardRoot,
  ItemCardTitle,
} from '@/components/ui/item-card';
import type { PrebuiltMCPServer } from '@/lib/data/prebuilt-mcp-servers';

// URL Display Component with ellipsis
function URLDisplay({ url }: { url: string }) {
  return (
    <div className="rounded py-1 min-w-0">
      <code className="text-sm text-muted-foreground block truncate">{url}</code>
    </div>
  );
}

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
            imageUrl={server.imageUrl}
            name={server.name}
            size={24}
            className="mt-0.5 flex-shrink-0"
          />
          <span className="flex-1 min-w-0 text-base font-medium truncate">{server.name}</span>
        </ItemCardTitle>
      </ItemCardHeader>

      <ItemCardContent>
        <div className="space-y-3 min-w-0">
          <URLDisplay url={server.url} />
        </div>
      </ItemCardContent>
    </ItemCardRoot>
  );
}
