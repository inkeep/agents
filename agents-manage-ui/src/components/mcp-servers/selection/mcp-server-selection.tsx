'use client';

import type { User } from 'better-auth';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { MCPServerForm } from '@/components/mcp-servers/form/mcp-server-form';
import {
  type CredentialScope,
  CredentialScopeEnum,
} from '@/components/mcp-servers/form/validation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthSession } from '@/hooks/use-auth';
import { useOAuthLogin } from '@/hooks/use-oauth-login';
import type { Credential } from '@/lib/api/credentials';
import { createMCPTool } from '@/lib/api/tools';
import type { PrebuiltMCPServer } from '@/lib/data/prebuilt-mcp-servers';
import { generateId } from '@/lib/utils/id-utils';
import { PrebuiltServersGrid } from './prebuilt-servers-grid';
import { ScopeSelectionDialog } from './scope-selection-dialog';

export function createMcpServerNameWithUserSuffix(serverName: string, user?: User | null): string {
  const userSuffix = user?.name ? ` (${user.name})` : user?.email ? ` (${user.email})` : '';
  return `${serverName}${userSuffix}`;
}

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
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const [pendingServer, setPendingServer] = useState<PrebuiltMCPServer | null>(null);
  const router = useRouter();
  const { user } = useAuthSession();

  const { handleOAuthLogin } = useOAuthLogin({
    tenantId,
    projectId,
  });

  const handleSelectPrebuiltServer = (server: PrebuiltMCPServer) => {
    // For servers that require auth, show scope selection dialog first
    if (!server.isOpen) {
      setPendingServer(server);
      setScopeDialogOpen(true);
    } else {
      // Open servers don't need credentials, proceed directly
      createServerWithScope(server, CredentialScopeEnum.project);
    }
  };

  const createServerWithScope = async (server: PrebuiltMCPServer, scope: CredentialScope) => {
    setLoadingServerId(server.id);
    setPendingServer(null);

    const mcpServerName = createMcpServerNameWithUserSuffix(server.name, user);

    try {
      const mcpToolData = {
        id: generateId(),
        name: mcpServerName,
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
        credentialReferenceId: null,
        credentialScope: scope,
        imageUrl: server.imageUrl,
      };

      const newTool = await createMCPTool(tenantId, projectId, mcpToolData);

      // For user-scoped, don't start OAuth - just redirect to detail page
      if (scope === CredentialScopeEnum.user) {
        toast.success(
          `${server.name} MCP server created. Users can connect their own accounts from the detail page.`
        );
        router.push(`/${tenantId}/projects/${projectId}/mcp-servers/${newTool.id}`);
        return;
      }

      // For project-scoped, proceed with OAuth
      if (server.isOpen) {
        toast.success(`${server.name} MCP server created successfully`);
        router.push(`/${tenantId}/projects/${projectId}/mcp-servers/${newTool.id}`);
      } else if (server.thirdPartyConnectAccountUrl) {
        handleOAuthLogin({
          toolId: newTool.id,
          mcpServerUrl: server.url,
          toolName: mcpServerName,
          thirdPartyConnectAccountUrl: server.thirdPartyConnectAccountUrl,
        });
      } else {
        handleOAuthLogin({ toolId: newTool.id, mcpServerUrl: server.url, toolName: mcpServerName });
      }
    } catch (error) {
      console.error('Failed to create prebuilt MCP server:', error);
      toast.error(`Failed to create ${server.name} server. Please try again.`);
      setLoadingServerId(undefined);
    }
  };

  const handleScopeConfirm = (scope: CredentialScope) => {
    if (pendingServer) {
      createServerWithScope(pendingServer, scope);
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
            tenantId={tenantId}
            projectId={projectId}
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

      {/* Scope selection dialog for prebuilt servers */}
      <ScopeSelectionDialog
        open={scopeDialogOpen}
        onOpenChange={setScopeDialogOpen}
        serverName={pendingServer?.name ?? ''}
        onConfirm={handleScopeConfirm}
      />
    </>
  );
}
