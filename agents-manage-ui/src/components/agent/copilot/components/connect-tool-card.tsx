import { CheckCircle2, ExternalLink, Loader2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { MCPToolImage } from '@/components/mcp-servers/mcp-tool-image';
import { Button } from '@/components/ui/button';
import { fetchThirdPartyMCPServer } from '@/lib/api/mcp-catalog';
import { fetchMCPTool } from '@/lib/api/tools';

/**
 * Parameters for initiating OAuth login for an MCP tool
 */
export interface OAuthLoginParams {
  toolId: string;
  mcpServerUrl: string;
  toolName: string;
  thirdPartyConnectAccountUrl?: string;
}

/**
 * Handler function for OAuth login
 */
export type OAuthLoginHandler = (params: OAuthLoginParams) => Promise<void>;

export interface ConnectToolCardProps {
  toolId: string;
  targetTenantId?: string;
  targetProjectId?: string;
  onConnect: OAuthLoginHandler
}

export function ConnectToolCard({
  toolId,
  targetTenantId,
  targetProjectId,
  onConnect,
}: ConnectToolCardProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'connecting' | 'success' | 'error'>(
    'loading'
  );
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [toolDetails, setToolDetails] = useState<{
    name: string;
    imageUrl?: string;
    url: string;
    thirdPartyConnectAccountUrl?: string;
  } | null>(null);

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
        const isThirdPartyMCPServer = serverUrl.includes('composio.dev');

        let thirdPartyConnectAccountUrl: string | undefined;

        // Fetch third-party connect URL if this is a third-party server with needs_auth status
        if (isThirdPartyMCPServer && tool.status === 'needs_auth') {
          try {
            const response = await fetchThirdPartyMCPServer(
              targetTenantId,
              targetProjectId,
              serverUrl
            );
            if (response.data?.thirdPartyConnectAccountUrl) {
              thirdPartyConnectAccountUrl = response.data.thirdPartyConnectAccountUrl;
            }
          } catch (thirdPartyErr) {
            console.error('Failed to fetch third-party connect URL:', thirdPartyErr);
            setErrorMessage('Failed to fetch third-party connect URL. Go to the MCP server page to see more details.');
          }
        } else if (isThirdPartyMCPServer && tool.status === 'healthy') {
          setStatus('success');
        }

        setToolDetails({
          name: tool.name,
          imageUrl: tool.imageUrl,
          url: serverUrl,
          thirdPartyConnectAccountUrl,
        });
        setStatus('idle');
      } catch (err) {
        console.error('Failed to fetch tool details:', err);
        setStatus('error');
        setErrorMessage('Failed to load tool details');
      }
    };

    fetchDetails();
  }, [toolId, targetTenantId, targetProjectId]);

  const handleConnectClick = async () => {
    if (!toolId || !toolDetails) {
      setStatus('error');
      setErrorMessage('Tool ID and details are required to complete OAuth');
      return;
    }

    setStatus('connecting');
    setErrorMessage('');

    try {
      await onConnect({
        toolId,
        toolName: toolDetails.name,
        mcpServerUrl: toolDetails.url,
        thirdPartyConnectAccountUrl: toolDetails.thirdPartyConnectAccountUrl,
      });
      setStatus('success');
    } catch (error) {
      console.error('OAuth failed:', error);
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'OAuth failed');
    }
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
          <span>Successfully authenticated!</span>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-start gap-2 mt-3 text-sm text-destructive">
          <XCircle className="size-4 mt-0.5" />
          <span>{errorMessage || 'Connection failed. Please try again.'}</span>
        </div>
      )}
    </div>
  );
}

