'use client';

import { nanoid } from 'nanoid';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { MCPServerForm } from '@/components/mcp-servers/form/mcp-server-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useOAuthLogin } from '@/hooks/use-oauth-login';
import type { Credential } from '@/lib/api/credentials';
import { createMCPTool } from '@/lib/api/tools';
import type { PrebuiltMCPServer } from '@/lib/data/prebuilt-mcp-servers';
import { PrebuiltServersGrid } from './prebuilt-servers-grid';

interface MCPServerSelectionProps {
  credentials: Credential[];
  tenantId: string;
  projectId: string;
}

type SelectionMode = 'popular' | 'custom';

export function MCPServerSelection({ credentials, tenantId, projectId }: MCPServerSelectionProps) {
  const [loadingServerId, setLoadingServerId] = useState<string>();
  const [selectedMode, setSelectedMode] = useState<SelectionMode>('popular');
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();

  const { handleOAuthLogin } = useOAuthLogin({
    tenantId,
    projectId,
    onError: () => {
      setLoadingServerId(undefined);
    },
  });

  const handleSelectPrebuiltServer = async (server: PrebuiltMCPServer) => {
    setLoadingServerId(server.id);

    try {
      // Transform prebuilt server data to MCPToolFormData format
      const mcpToolData = {
        id: nanoid(),
        name: server.name,
        config: {
          type: 'mcp' as const,
          mcp: {
            server: {
              url: server.url,
            },
            transport: {
              type: server.transport,
            },
          },
        },
        credentialReferenceId: null, // OAuth servers typically don't need pre-configured credentials
        imageUrl: server.imageUrl,
      };

      const newTool = await createMCPTool(tenantId, projectId, mcpToolData);

      if (server.isOpen) {
        toast.success(`${server.name} MCP server created successfully`);
        router.push(`/${tenantId}/projects/${projectId}/mcp-servers/${newTool.id}`);
      } else {
        handleOAuthLogin(newTool.id);
      }
    } catch (error) {
      console.error('Failed to create prebuilt MCP server:', error);
      toast.error(`Failed to create ${server.name} server. Please try again.`);
      setLoadingServerId(undefined);
    }
  };

  return (
    <>
      <PageHeader
        className="gap-2 items-start"
        title={selectedMode === 'popular' ? 'Popular MCP Servers' : 'Custom MCP Server'}
        description={
          selectedMode === 'popular'
            ? 'Connect to popular services with pre-configured servers. Click any server to set up with OAuth authentication.'
            : 'Configure a custom MCP server by providing the server URL and transport details.'
        }
        action={
          <div className="flex bg-muted p-1 rounded-lg">
            <Button
              variant={selectedMode === 'popular' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setSelectedMode('popular')}
            >
              Popular Servers
            </Button>
            <Button
              variant={selectedMode === 'custom' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setSelectedMode('custom')}
            >
              Custom Server
            </Button>
          </div>
        }
      />

      {/* Content */}
      {selectedMode === 'popular' ? (
        <div className="space-y-6">
          <div className="max-w-sm">
            <Input
              placeholder="Search servers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <PrebuiltServersGrid
            onSelectServer={handleSelectPrebuiltServer}
            loadingServerId={loadingServerId}
            searchQuery={searchQuery}
          />
        </div>
      ) : (
        <div className="max-w-2xl mx-auto">
          <MCPServerForm credentials={credentials} tenantId={tenantId} projectId={projectId} />
        </div>
      )}
    </>
  );
}
