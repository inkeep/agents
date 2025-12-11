'use client';

import { AlertCircle, CheckCircle2, Lock, Pencil, User } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ExternalLink } from '@/components/ui/external-link';
import { InfoCard } from '@/components/ui/info-card';
import { useOAuthLogin } from '@/hooks/use-oauth-login';
import { type Credential, fetchUserScopedCredential } from '@/lib/api/credentials';
import { fetchThirdPartyMCPServer } from '@/lib/api/mcp-catalog';
import type { MCPTool } from '@/lib/types/tools';
import { Button } from '../ui/button';
import { CopyableMultiLineCode } from '../ui/copyable-multi-line-code';
import { CopyableSingleLineCode } from '../ui/copyable-single-line-code';
import { AvailableToolsCard } from './available-tools-card';
import { MCPToolImage } from './mcp-tool-image';
import {
  ActiveToolBadge,
  formatDate,
  ItemLabel,
  ItemValue,
  isExpired,
} from './view-mcp-server-details-shared';

export function ViewMCPServerDetailsUserScope({
  tool,
  tenantId,
  projectId,
}: {
  tool: MCPTool;
  tenantId: string;
  projectId: string;
}) {
  const [userCredential, setUserCredential] = useState<Credential | null>(null);
  const [isLoadingCredential, setIsLoadingCredential] = useState(true);

  const { handleOAuthLogin } = useOAuthLogin({
    tenantId,
    projectId,
    onFinish: () => {
      window.location.reload();
    },
  });

  const isThirdPartyMCPServer = tool.config.mcp.server.url.includes('composio.dev');
  const [thirdPartyConnectUrl, setThirdPartyConnectUrl] = useState<string>();
  const [isLoadingThirdParty, setIsLoadingThirdParty] = useState(false);

  // Fetch user's credential for this tool
  useEffect(() => {
    const loadUserCredential = async () => {
      setIsLoadingCredential(true);
      try {
        const credential = await fetchUserScopedCredential(tenantId, projectId, tool.id);
        setUserCredential(credential);
      } catch (error) {
        console.error('Failed to fetch user credential:', error);
        setUserCredential(null);
      } finally {
        setIsLoadingCredential(false);
      }
    };

    loadUserCredential();
  }, [tenantId, projectId, tool.id]);

  // Fetch third-party connect URL if needed (user-scoped)
  useEffect(() => {
    if (isThirdPartyMCPServer && !userCredential) {
      const fetchServerDetails = async () => {
        setIsLoadingThirdParty(true);
        try {
          const response = await fetchThirdPartyMCPServer(
            tenantId,
            projectId,
            tool.config.mcp.server.url,
            'user'
          );
          if (response.data?.thirdPartyConnectAccountUrl) {
            setThirdPartyConnectUrl(response.data.thirdPartyConnectAccountUrl);
          }
        } catch (error) {
          console.error('Failed to fetch third-party MCP server details:', error);
        } finally {
          setIsLoadingThirdParty(false);
        }
      };

      fetchServerDetails();
    }
  }, [isThirdPartyMCPServer, userCredential, tool.config.mcp.server.url, tenantId, projectId]);

  const isConnected = !!userCredential;

  return (
    <div className="max-w-2xl mx-auto py-4 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MCPToolImage
            imageUrl={tool.imageUrl}
            name={tool.name}
            size={48}
            className="rounded-lg"
          />
          <div>
            <h2 className="text-xl font-medium tracking-tight">{tool.name}</h2>
            <p className="text-sm text-muted-foreground">MCP server details</p>
          </div>
        </div>
        <Button asChild>
          <Link href={`/${tenantId}/projects/${projectId}/mcp-servers/${tool.id}/edit`}>
            <Pencil className="w-4 h-4" />
            Edit
          </Link>
        </Button>
      </div>

      {/* Basic Information */}
      <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <ItemLabel>Created At</ItemLabel>
            <ItemValue>{tool.createdAt ? formatDate(tool.createdAt) : 'N/A'}</ItemValue>
          </div>
          <div className="space-y-2">
            <ItemLabel>Updated At</ItemLabel>
            <ItemValue>{tool.updatedAt ? formatDate(tool.updatedAt) : 'N/A'}</ItemValue>
          </div>
        </div>

        {/* User Connection Status Card */}
        {isLoadingCredential ? (
          <InfoCard title="Loading...">
            <p className="text-sm text-muted-foreground">Checking your connection status...</p>
          </InfoCard>
        ) : isConnected ? (
          <InfoCard title="Connected">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-sm font-medium">Your account is connected</span>
              </div>
              <p className="text-sm text-muted-foreground">
                You have connected your personal credentials to this MCP server.
              </p>
              {userCredential && (
                <div className="flex items-center gap-2">
                  <Badge variant="code" className="flex items-center gap-2">
                    <Lock className="w-3 h-3" />
                    {userCredential.name}
                  </Badge>
                  <ExternalLink
                    href={`/${tenantId}/projects/${projectId}/credentials/${userCredential.id}`}
                    className="text-xs"
                  >
                    view credential
                  </ExternalLink>
                </div>
              )}
            </div>
          </InfoCard>
        ) : (
          <InfoCard title="Connect Your Account">
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This MCP server requires each user to connect their own account. Click below to
                authenticate with your personal credentials.
              </p>
              <Button
                size="sm"
                onClick={() => {
                  handleOAuthLogin({
                    toolId: tool.id,
                    mcpServerUrl: tool.config.mcp.server.url,
                    toolName: tool.name,
                    thirdPartyConnectAccountUrl: thirdPartyConnectUrl,
                    credentialScope: 'user',
                  });
                }}
                disabled={isLoadingThirdParty}
              >
                {isLoadingThirdParty ? 'Loading...' : 'Connect My Account'}
              </Button>
            </div>
          </InfoCard>
        )}

        {/* Status and Transport Type */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <ItemLabel>Your Status</ItemLabel>
            <ItemValue className="items-center">
              {isLoadingCredential ? (
                <Badge variant="outline">Loading...</Badge>
              ) : isConnected ? (
                <Badge className="uppercase" variant="success">
                  Connected
                </Badge>
              ) : (
                <Badge variant="warning">Not Connected</Badge>
              )}
            </ItemValue>
          </div>
          {(tool.config as any).mcp.transport && (
            <div className="space-y-2">
              <ItemLabel>Transport Type</ItemLabel>
              <ItemValue>
                <Badge variant="code">{(tool.config as any).mcp.transport.type}</Badge>
              </ItemValue>
            </div>
          )}
        </div>

        {/* Last Error */}
        {tool.lastError && (
          <div className="space-y-2">
            <ItemLabel>Last Error</ItemLabel>
            <CopyableMultiLineCode code={tool.lastError} />
          </div>
        )}

        {/* Server URL */}
        <div className="space-y-2">
          <ItemLabel>Server URL</ItemLabel>
          {tool.config.type === 'mcp' && (
            <CopyableSingleLineCode code={tool.config.mcp.server.url} />
          )}
        </div>

        {/* Credential Scope and Created By */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <ItemLabel>Credential Scope</ItemLabel>
            <ItemValue className="items-center">
              <Badge variant="outline" className="flex items-center gap-1.5">
                <User className="w-3 h-3" />
                User (per-user credentials)
              </Badge>
            </ItemValue>
          </div>
          {tool.createdBy && (
            <div className="space-y-2">
              <ItemLabel>Created By</ItemLabel>
              <ItemValue>{tool.createdBy}</ItemValue>
            </div>
          )}
        </div>

        {/* User Credential Details */}
        {isConnected && userCredential && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <ItemLabel>Your Credential</ItemLabel>
              <ItemValue className="items-center">
                <div className="flex items-center gap-2">
                  <Badge variant="code" className="flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    {userCredential.id}
                  </Badge>
                  <ExternalLink
                    href={`/${tenantId}/projects/${projectId}/credentials/${userCredential.id}`}
                    className="text-xs"
                  >
                    view
                  </ExternalLink>
                </div>
              </ItemValue>
            </div>
            {userCredential.createdAt && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ItemLabel>Connected At</ItemLabel>
                  {isExpired(userCredential.createdAt) && (
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                  )}
                </div>
                <ItemValue>{formatDate(userCredential.createdAt)}</ItemValue>
              </div>
            )}
          </div>
        )}

        {/* Active Tools */}
        <div className="space-y-2">
          <div className="flex gap-2 items-center">
            <ItemLabel>Active Tools</ItemLabel>
            <Badge variant="count">
              {(tool.config as any).mcp.activeTools === undefined
                ? (tool.availableTools?.length ?? 0)
                : ((tool.config as any).mcp.activeTools?.length ?? 0)}
            </Badge>
          </div>
          <ItemValue>
            {(tool.config as any).mcp.activeTools === undefined ? (
              tool.availableTools && tool.availableTools.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {tool.availableTools.map((toolInfo) => (
                    <ActiveToolBadge key={toolInfo.name} toolName={toolInfo.name} isAvailable />
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No tools available</div>
              )
            ) : (tool.config as any).mcp.activeTools &&
              (tool.config as any).mcp.activeTools.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {(tool.config as any).mcp.activeTools.map((toolName: string) => {
                  const isAvailable =
                    tool.availableTools?.some((t) => t.name === toolName) ?? false;
                  return (
                    <ActiveToolBadge key={toolName} toolName={toolName} isAvailable={isAvailable} />
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">None</div>
            )}
          </ItemValue>
        </div>

        {/* Available Tools */}
        {tool.availableTools && tool.availableTools.length > 0 && (
          <AvailableToolsCard
            tools={tool.availableTools}
            activeTools={(tool.config as any).mcp.activeTools}
          />
        )}
      </div>
    </div>
  );
}
