'use client';

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
import { useOAuthLogin } from '@/hooks/use-oauth-login';
import { useScopeSelection } from '@/hooks/use-scope-selection';
import type { Credential } from '@/lib/api/credentials';
import { getThirdPartyOAuthRedirectUrl } from '@/lib/api/mcp-catalog';
import { createMCPTool } from '@/lib/api/tools';
import type { PrebuiltMCPServer } from '@/lib/data/prebuilt-mcp-servers';
import { generateId } from '@/lib/utils/id-utils';
import { PrebuiltServersGrid } from './prebuilt-servers-grid';

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

type SelectionMode = 'popular' | 'custom';

export function MCPServerSelection({ credentials, tenantId, projectId }: MCPServerSelectionProps) {
  const [loadingServerId, setLoadingServerId] = useState<string>();
  const [selectedMode, setSelectedMode] = useState<SelectionMode>('popular');
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();

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
      {ScopeDialog}
    </>
  );
}
