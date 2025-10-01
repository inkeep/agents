'use client';

import { type PrebuiltMCPServer, usePrebuiltMCPServers } from '@/lib/data/prebuilt-mcp-servers';
import { PrebuiltServerCard } from './prebuilt-server-card';

interface PrebuiltServersGridProps {
  onSelectServer: (server: PrebuiltMCPServer) => void;
  loadingServerId?: string;
  searchQuery?: string;
}

export function PrebuiltServersGrid({
  onSelectServer,
  loadingServerId,
  searchQuery = '',
}: PrebuiltServersGridProps) {
  const prebuiltMCPServers = usePrebuiltMCPServers();
  const filteredServers = prebuiltMCPServers.filter(
    (server) =>
      server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      server.url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (filteredServers.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No servers found matching "{searchQuery}".</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {filteredServers.map((server) => (
        <PrebuiltServerCard
          key={server.id}
          server={server}
          onSelect={onSelectServer}
          isLoading={loadingServerId === server.id}
          disabled={!!loadingServerId && loadingServerId !== server.id}
        />
      ))}
    </div>
  );
}
