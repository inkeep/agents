'use client';

import {
  DEV_TOOLS_HTTP_MCP,
  DEV_TOOLS_MCP,
  DEV_TOOLS_MEDIA_MCP,
  DEV_TOOLS_SEARCH_MCP,
} from '@inkeep/agents-core';
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
import { useRuntimeConfig } from '@/contexts/runtime-config';
import { useOAuthLogin } from '@/hooks/use-oauth-login';
import { useScopeSelection } from '@/hooks/use-scope-selection';
import type { Credential } from '@/lib/api/credentials';
import { getThirdPartyOAuthRedirectUrl } from '@/lib/api/mcp-catalog';
import { createMCPTool } from '@/lib/api/tools';
import type { PrebuiltMCPServer } from '@/lib/data/prebuilt-mcp-servers';
import { generateId } from '@/lib/utils/id-utils';
import { BuiltInMcpCard } from './built-in-mcp-card';
import { PrebuiltServersGrid } from './prebuilt-servers-grid';
import { WorkAppGitHubCard } from './work-app-github-card';
import { WorkAppGitHubRepositoryConfigDialog } from './work-app-github-repository-config-dialog';
import { WorkAppSlackCard } from './work-app-slack-card';
import { WorkAppSlackChannelConfigDialog } from './work-app-slack-channel-config-dialog';

const BUILT_IN_MCPS = [
  DEV_TOOLS_MCP,
  DEV_TOOLS_HTTP_MCP,
  DEV_TOOLS_MEDIA_MCP,
  DEV_TOOLS_SEARCH_MCP,
];

/**
 * Remove user_id from Composio URLs before storing in DB.
 * user_id is ALWAYS injected at discovery/runtime based on scope:
 * - Project-scoped: tenantId||projectId
 * - User-scoped: actual userId
 */
function removeComposioUserId(originalUrl: string): string {
  if (!originalUrl.includes('composio.dev')) {
    return originalUrl;
  }

  const urlObj = new URL(originalUrl);
  urlObj.searchParams.delete('user_id');
  return urlObj.toString();
}

interface MCPServerSelectionProps {
  credentials: Credential[];
  tenantId: string;
  projectId: string;
}

type SelectionMode = 'popular' | 'builtin' | 'workapps' | 'custom';

export function MCPServerSelection({ credentials, tenantId, projectId }: MCPServerSelectionProps) {
  const [loadingServerId, setLoadingServerId] = useState<string>();
  const [loadingBuiltInId, setLoadingBuiltInId] = useState<string>();
  const [selectedMode, setSelectedMode] = useState<SelectionMode>('popular');
  const [searchQuery, setSearchQuery] = useState('');
  const [gitHubDialogOpen, setGitHubDialogOpen] = useState(false);
  const [slackDialogOpen, setSlackDialogOpen] = useState(false);
  const router = useRouter();
  const { PUBLIC_INKEEP_AGENTS_API_URL } = useRuntimeConfig();

  const { handleOAuthLogin } = useOAuthLogin({
    tenantId,
    projectId,
  });

  const createServerWithScope = async ({
    server,
    scope,
  }: {
    server: PrebuiltMCPServer;
    scope: CredentialScope;
  }) => {
    setLoadingServerId(server.id);

    const mcpServerName = server.name;
    const serverUrl = removeComposioUserId(server.url);

    try {
      const mcpToolData = {
        id: generateId(),
        name: mcpServerName,
        config: {
          type: 'mcp' as const,
          mcp: {
            server: {
              url: serverUrl,
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

      // proceed with OAuth flow
      const isThirdPartyServer = serverUrl.includes('composio.dev');

      if (server.isOpen) {
        toast.success(`${server.name} MCP server created successfully`);
        router.push(`/${tenantId}/projects/${projectId}/mcp-servers/${newTool.id}`);
      } else if (isThirdPartyServer) {
        const credentialScopedRedirectUrl = await getThirdPartyOAuthRedirectUrl(
          tenantId,
          projectId,
          serverUrl,
          scope
        );
        if (credentialScopedRedirectUrl) {
          handleOAuthLogin({
            toolId: newTool.id,
            mcpServerUrl: serverUrl,
            toolName: mcpServerName,
            thirdPartyConnectAccountUrl: credentialScopedRedirectUrl,
            credentialScope: scope,
          });
        } else {
          // Fallback: redirect to detail page if we couldn't get the OAuth URL
          toast.error(`Failed to get OAuth URL. Please try connecting from the detail page.`);
          router.push(`/${tenantId}/projects/${projectId}/mcp-servers/${newTool.id}`);
        }
      } else {
        handleOAuthLogin({
          toolId: newTool.id,
          mcpServerUrl: serverUrl,
          toolName: mcpServerName,
          credentialScope: scope,
        });
      }
    } catch (error) {
      console.error('Failed to create prebuilt MCP server:', error);
      toast.error(`Failed to create ${server.name} server. Please try again.`);
      setLoadingServerId(undefined);
    }
  };

  const { requestScopeSelection, ScopeDialog } = useScopeSelection<PrebuiltMCPServer>({
    onConfirm: (scope, server) => {
      createServerWithScope({ server, scope });
    },
  });

  const handleSelectPrebuiltServer = (server: PrebuiltMCPServer) => {
    // For servers that require auth, show scope selection dialog first
    if (server.isOpen) {
      // Open servers don't need credentials, proceed directly
      createServerWithScope({ server, scope: CredentialScopeEnum.project });
    } else {
      requestScopeSelection(server.name, server);
    }
  };

  const handleSelectBuiltIn = async (id: string) => {
    const mcp = BUILT_IN_MCPS.find((m) => m.id === id);
    if (!mcp) return;

    setLoadingBuiltInId(id);
    try {
      const newTool = await createMCPTool(tenantId, projectId, {
        id: generateId(),
        name: mcp.name,
        config: {
          type: 'mcp' as const,
          mcp: {
            server: { url: `${PUBLIC_INKEEP_AGENTS_API_URL}${mcp.urlPath}` },
            transport: { type: 'streamable_http' },
          },
        },
        credentialReferenceId: null,
        credentialScope: CredentialScopeEnum.project,
      });
      toast.success(`${mcp.name} added successfully`);
      router.push(`/${tenantId}/projects/${projectId}/mcp-servers/${newTool.id}`);
    } catch (error) {
      console.error('Failed to create built-in MCP:', error);
      toast.error(`Failed to add ${mcp.name}. Please try again.`);
      setLoadingBuiltInId(undefined);
    }
  };

  const getPageTitle = () => {
    switch (selectedMode) {
      case 'popular':
        return 'Popular MCP Servers';
      case 'builtin':
        return 'Built-in Tools';
      case 'workapps':
        return 'Work Apps';
      case 'custom':
        return 'Custom MCP Server';
    }
  };

  const getPageDescription = () => {
    switch (selectedMode) {
      case 'popular':
        return 'Connect to popular services with pre-configured servers. Click any server to set up with OAuth authentication.';
      case 'builtin':
        return 'First-party tools built into Inkeep. No configuration needed — authentication is handled automatically.';
      case 'workapps':
        return 'First-party integrations with secure authentication. Configure access to specific repositories and resources.';
      case 'custom':
        return 'Configure a custom MCP server by providing the server URL and transport details.';
    }
  };

  return (
    <>
      <PageHeader
        className="gap-2 items-start"
        title={getPageTitle()}
        description={getPageDescription()}
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
              variant={selectedMode === 'builtin' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setSelectedMode('builtin')}
            >
              Built-in Tools
            </Button>
            <Button
              variant={selectedMode === 'workapps' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setSelectedMode('workapps')}
            >
              Work Apps
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
      {selectedMode === 'popular' && (
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
      )}

      {selectedMode === 'builtin' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {BUILT_IN_MCPS.map((mcp) => (
            <BuiltInMcpCard
              key={mcp.id}
              id={mcp.id}
              name={mcp.name}
              description={mcp.description}
              tools={mcp.tools}
              onSelect={handleSelectBuiltIn}
              isLoading={loadingBuiltInId === mcp.id}
              disabled={!!loadingBuiltInId && loadingBuiltInId !== mcp.id}
            />
          ))}
        </div>
      )}

      {selectedMode === 'workapps' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <WorkAppGitHubCard onClick={() => setGitHubDialogOpen(true)} />
          <WorkAppSlackCard onClick={() => setSlackDialogOpen(true)} />
        </div>
      )}

      {selectedMode === 'custom' && (
        <div className="max-w-2xl mx-auto">
          <MCPServerForm credentials={credentials} tenantId={tenantId} projectId={projectId} />
        </div>
      )}

      {/* Scope selection dialog for prebuilt servers */}
      {ScopeDialog}

      {/* GitHub configuration dialog for Work Apps */}
      <WorkAppGitHubRepositoryConfigDialog
        tenantId={tenantId}
        projectId={projectId}
        open={gitHubDialogOpen}
        onOpenChange={setGitHubDialogOpen}
        onSuccess={(toolId: string) => {
          router.push(`/${tenantId}/projects/${projectId}/mcp-servers/${toolId}`);
        }}
      />

      {/* Slack configuration dialog for Work Apps */}
      <WorkAppSlackChannelConfigDialog
        tenantId={tenantId}
        projectId={projectId}
        open={slackDialogOpen}
        onOpenChange={setSlackDialogOpen}
        onSuccess={(toolId: string) => {
          router.push(`/${tenantId}/projects/${projectId}/mcp-servers/${toolId}`);
        }}
      />
    </>
  );
}
