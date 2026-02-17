import { CheckCircle2, ExternalLink, Loader2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CredentialScope } from '@/components/mcp-servers/form/validation';
import { MCPToolImage } from '@/components/mcp-servers/mcp-tool-image';
import { Button } from '@/components/ui/button';
import { useScopeSelection } from '@/hooks/use-scope-selection';
import { getThirdPartyOAuthRedirectUrl } from '@/lib/api/mcp-catalog';
import { fetchMCPTool, updateMCPTool } from '@/lib/api/tools';
import type { MCPTool } from '@/lib/types/tools';

/**
 * Parameters for initiating OAuth login for an MCP tool
 */
export interface OAuthLoginParams {
  toolId: string;
  mcpServerUrl: string;
  toolName: string;
  thirdPartyConnectAccountUrl?: string;
  credentialScope: 'project' | 'user';
}

/**
 * Handler function for OAuth login
 */
export type OAuthLoginHandler = (params: OAuthLoginParams) => Promise<void>;

interface ConnectToolCardProps {
  toolId: string;
  targetTenantId?: string;
  targetProjectId?: string;
  onConnect: OAuthLoginHandler;
  refreshAgentGraph?: (options?: { fetchTools?: boolean }) => Promise<void>;
}

export function ConnectToolCard({
  toolId,
  targetTenantId,
  targetProjectId,
  onConnect,
  refreshAgentGraph,
}: ConnectToolCardProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'connecting' | 'success' | 'error'>(
    'loading'
  );
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [toolDetails, setToolDetails] = useState<{
    name: string;
    imageUrl?: string;
    url: string;
    toolStatus: MCPTool['status'];
    credentialScope?: 'project' | 'user';
  } | null>(null);

  // Scope selection hook for optional scope dialog
  const { requestScopeSelection, ScopeDialog } = useScopeSelection<undefined>({
    onConfirm: async (scope: CredentialScope) => {
      await executeConnect(scope);
      refreshAgentGraph?.({ fetchTools: true });
    },
  });

  useEffect(() => {
    const fetchDetails = async () => {
      if (!targetTenantId || !targetProjectId || !toolId) {
        setStatus('error');
        setErrorMessage('Missing tenant, project, or tool ID');
        return;
      }

      try {
        const tool = await fetchMCPTool(targetTenantId, targetProjectId, toolId);
        const serverUrl = tool.config?.mcp?.server?.url || '';
        const credentialScope = (tool.credentialScope as 'project' | 'user') || 'project';

        setToolDetails({
          name: tool.name,
          imageUrl: tool.imageUrl,
          url: serverUrl,
          toolStatus: tool.status,
          credentialScope,
        });

        // Set final status based on tool health
        if (tool.status === 'healthy') {
          setStatus('success');
          refreshAgentGraph?.({ fetchTools: true });
        } else {
          setStatus('idle');
        }
      } catch (err) {
        console.error('Failed to fetch tool details:', err);
        setStatus('error');
        setErrorMessage('Failed to load tool details');
      }
    };

    fetchDetails();
  }, [toolId, targetTenantId, targetProjectId, refreshAgentGraph]);

  /**
   * Executes the actual connection with the given scope.
   */
  const executeConnect = async (scope: CredentialScope) => {
    if (!toolId || !toolDetails || !targetTenantId || !targetProjectId) {
      setStatus('error');
      setErrorMessage('Tool ID and details are required to complete OAuth');
      return;
    }

    await updateMCPTool(targetTenantId, targetProjectId, toolId, {
      credentialScope: scope,
    });

    setStatus('connecting');
    setErrorMessage('');

    // proceed with OAuth flow
    const isThirdPartyServer = toolDetails.url.includes('composio.dev');
    let credentialScopedRedirectUrl: string | null = null;
    if (isThirdPartyServer) {
      try {
        credentialScopedRedirectUrl = await getThirdPartyOAuthRedirectUrl(
          targetTenantId,
          targetProjectId,
          toolDetails.url,
          scope
        );

        if (!credentialScopedRedirectUrl) {
          setStatus('error');
          setErrorMessage('Failed to get OAuth URL. Please try connecting from the detail page.');
          return;
        }
      } catch {
        setStatus('error');
        setErrorMessage('Failed to get OAuth URL. Please try connecting from the detail page.');
        return;
      }
    }

    try {
      await onConnect({
        toolId,
        toolName: toolDetails.name,
        mcpServerUrl: toolDetails.url,
        thirdPartyConnectAccountUrl: credentialScopedRedirectUrl ?? undefined,
        credentialScope: scope,
      });
      setStatus('success');
    } catch (error) {
      console.error('OAuth failed:', error);
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'OAuth failed');
    }
  };

  /**
   * Handles the Connect button click.
   * Shows scope selection dialog if enabled, otherwise proceeds directly.
   */
  const handleConnectClick = () => {
    if (!toolId || !toolDetails) {
      setStatus('error');
      setErrorMessage('Tool ID and details are required to complete OAuth');
      return;
    }

    requestScopeSelection(toolDetails.name, undefined);
  };

  if (status === 'loading') {
    return (
      <div className="p-4 rounded-lg border border-border bg-card shadow-sm">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span>Loading tool details...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="p-4 rounded-lg border border-border bg-card shadow-sm">
        {/* Main row: Logo, Title, Button */}
        <div className="flex items-center gap-3 flex-wrap">
          {toolDetails && (
            <MCPToolImage
              imageUrl={toolDetails.imageUrl}
              name={toolDetails.name}
              size={24}
              className="shrink-0"
            />
          )}

          <h3 className="flex-1 min-w-0 text-base font-semibold text-foreground">
            {toolDetails?.name || toolId}
          </h3>

          {status !== 'success' && (
            <Button
              onClick={handleConnectClick}
              disabled={status === 'connecting' || !toolId}
              className="gap-2"
              size="sm"
            >
              {status === 'connecting' ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <ExternalLink className="size-4" />
                  Connect
                </>
              )}
            </Button>
          )}
        </div>

        {/* Status messages below */}
        {status === 'success' && (
          <div className="flex items-center gap-2 mt-3 text-sm text-green-600 dark:text-green-400">
            <CheckCircle2 className="size-4" />
            <span>Successfully added!</span>
          </div>
        )}

        {status === 'error' && (
          <div className="flex items-start gap-2 mt-3 text-sm text-destructive">
            <XCircle className="size-4 mt-0.5" />
            <span>{errorMessage || 'Connection failed. Please try again.'}</span>
          </div>
        )}
      </div>

      {/* Scope selection dialog */}
      {ScopeDialog}
    </>
  );
}
