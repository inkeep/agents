'use client';

import { AlertCircle, Lock, Pencil, User } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { ExternalLink } from '@/components/ui/external-link';
import { InfoCard } from '@/components/ui/info-card';
import { useProjectPermissions } from '@/contexts/project';
import { useOAuthLogin } from '@/hooks/use-oauth-login';
import { useUserScopedCredentialQuery } from '@/lib/query/credentials';
import { useThirdPartyMCPServerQuery } from '@/lib/query/mcp-catalog';
import type { MCPTool } from '@/lib/types/tools';
import { Button } from '../ui/button';
import { CopyableMultiLineCode } from '../ui/copyable-multi-line-code';
import { CopyableSingleLineCode } from '../ui/copyable-single-line-code';
import { AvailableToolsCard } from './available-tools-card';
import { MCPToolImage } from './mcp-tool-image';
import {
  ActiveToolBadge,
  formatDate,
  getStatusBadgeVariant,
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
  const { canEdit } = useProjectPermissions();

  const { handleOAuthLogin } = useOAuthLogin({
    tenantId,
    projectId,
    onFinish() {
      window.location.reload();
    },
  });

  const { data: userCredential, isFetching: isLoadingCredential } = useUserScopedCredentialQuery({
    toolId: tool.id,
  });
  const isThirdPartyMCPServer = tool.config.mcp.server.url.includes('composio.dev');
  const shouldFetchThirdParty = isThirdPartyMCPServer && tool.status === 'needs_auth';
  const { data: thirdPartyServer, isFetching: isLoadingThirdParty } = useThirdPartyMCPServerQuery({
    url: tool.config.mcp.server.url,
    credentialScope: 'user',
    enabled: shouldFetchThirdParty,
  });
  const thirdPartyConnectUrl = thirdPartyServer?.thirdPartyConnectAccountUrl;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
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
        {canEdit && (
          <Button asChild>
            <Link href={`/${tenantId}/projects/${projectId}/mcp-servers/${tool.id}/edit`}>
              <Pencil className="w-4 h-4" />
              Edit
            </Link>
          </Button>
        )}
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
        ) : (
          tool.status === 'needs_auth' && (
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
          )
        )}

        {/* Status and Transport Type */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <ItemLabel>Your Status</ItemLabel>
            <ItemValue className="items-center">
              <Badge className="uppercase" variant={getStatusBadgeVariant(tool.status)}>
                {tool.status === 'needs_auth'
                  ? 'Needs Login'
                  : tool.status === 'unavailable'
                    ? 'Unavailable'
                    : tool.status}
              </Badge>
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

        {/* Custom Prompt */}
        {tool.config.type === 'mcp' && tool.config.mcp.prompt && (
          <div className="space-y-2">
            <ItemLabel>Custom Prompt</ItemLabel>
            <ItemValue>
              <div className="text-sm bg-muted/50 p-3 rounded border whitespace-pre-wrap">
                {tool.config.mcp.prompt}
              </div>
            </ItemValue>
          </div>
        )}

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
        {userCredential && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <ItemLabel>Your Credential</ItemLabel>
              <ItemValue className="items-center">
                <div className="flex items-center gap-2">
                  <Badge variant="code" className="flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    {userCredential.name}
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
            {tool.expiresAt && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ItemLabel>Credential Expires At</ItemLabel>
                  {isExpired(tool.expiresAt) && <AlertCircle className="h-4 w-4 text-amber-500" />}
                </div>
                <ItemValue>{formatDate(tool.expiresAt)}</ItemValue>
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
            toolOverrides={(tool.config as any).mcp.toolOverrides}
          />
        )}
      </div>
    </div>
  );
}
