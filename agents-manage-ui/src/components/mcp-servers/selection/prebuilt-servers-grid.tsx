'use client';

import { Loader2 } from 'lucide-react';
import { type PrebuiltMCPServer, usePrebuiltMCPServers } from '@/lib/data/prebuilt-mcp-servers';
import { PrebuiltServerCard } from './prebuilt-server-card';

interface PrebuiltServersGridProps {
  tenantId: string;
  projectId: string;
  onSelectServer: (server: PrebuiltMCPServer) => void;
  loadingServerId?: string;
  searchQuery?: string;
}

export function PrebuiltServersGrid({
  tenantId,
  projectId,
  onSelectServer,
  loadingServerId,
  searchQuery = '',
}: PrebuiltServersGridProps) {
  const { servers: prebuiltMCPServers, isLoading } = usePrebuiltMCPServers(tenantId, projectId);

  const filteredServers = prebuiltMCPServers.filter(
    (server) =>
      server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      server.url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Show loading state while fetching
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (filteredServers.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          {searchQuery ? `No servers found matching "${searchQuery}".` : 'No servers available.'}
        </p>
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
