'use client';

import { AlertCircle, Lock, Pencil, Users } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { ExternalLink } from '@/components/ui/external-link';
import { useProjectPermissions } from '@/contexts/project';
import { useOAuthLogin } from '@/hooks/use-oauth-login';
import { useThirdPartyMCPServerQuery } from '@/lib/query/mcp-catalog';
import type { MCPTool } from '@/lib/types/tools';
import { formatDateTimeTable } from '@/lib/utils/format-date';
import { Button } from '../ui/button';
import { CopyableMultiLineCode } from '../ui/copyable-multi-line-code';
import { CopyableSingleLineCode } from '../ui/copyable-single-line-code';
import { AvailableToolsCard } from './available-tools-card';
import { MCPToolImage } from './mcp-tool-image';
import {
  ActiveToolBadge,
  getStatusBadgeVariant,
  ItemLabel,
  ItemValue,
  isExpired,
} from './view-mcp-server-details-shared';
import { isGitHubWorkapp, WorkAppGitHubAccessSection } from './work-app-github-access-section';

export function ViewMCPServerDetailsProjectScope({
  tool,
  tenantId,
  projectId,
}: {
  tool: MCPTool;
  tenantId: string;
  projectId: string;
}) {
  const { handleOAuthLogin } = useOAuthLogin({
    tenantId,
    projectId,
    onFinish: () => {
      window.location.reload();
    },
  });
  const { canEdit } = useProjectPermissions();

  const isThirdPartyMCPServer = tool.config.mcp.server.url.includes('composio.dev');
  const shouldFetchThirdParty = isThirdPartyMCPServer && tool.status === 'needs_auth';
  const { data: thirdPartyServer, isFetching: isLoadingThirdParty } = useThirdPartyMCPServerQuery({
    url: tool.config.mcp.server.url,
    credentialScope: 'project',
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
            <ItemValue>
              {tool.createdAt ? formatDateTimeTable(tool.createdAt, { local: true }) : 'N/A'}
            </ItemValue>
          </div>
          <div className="space-y-2">
            <ItemLabel>Updated At</ItemLabel>
            <ItemValue>
              {tool.updatedAt ? formatDateTimeTable(tool.updatedAt, { local: true }) : 'N/A'}
            </ItemValue>
          </div>
        </div>

        {/* Status and Transport Type */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <ItemLabel>Status</ItemLabel>
            <ItemValue className="items-center">
              {tool.status === 'needs_auth' ? (
                <Badge
                  variant="outline"
                  className="text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800 cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/30 hover:border-amber-300 dark:hover:border-amber-700 transition-colors"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleOAuthLogin({
                      toolId: tool.id,
                      mcpServerUrl: tool.config.mcp.server.url,
                      toolName: tool.name,
                      thirdPartyConnectAccountUrl: thirdPartyConnectUrl,
                      credentialScope: 'project',
                    });
                  }}
                >
                  {isLoadingThirdParty ? 'Loading...' : 'Click to Login'}
                </Badge>
              ) : (
                <Badge className="uppercase" variant={getStatusBadgeVariant(tool.status)}>
                  {tool.status}
                </Badge>
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
        {!isGitHubWorkapp(tool) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <ItemLabel>Credential Scope</ItemLabel>
              <ItemValue className="items-center">
                <Badge variant="outline" className="flex items-center gap-1.5">
                  <Users className="w-3 h-3" />
                  Project (shared credential)
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
        )}

        {/* Project Credential */}
        {tool.credentialReferenceId && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <ItemLabel>Project Credential</ItemLabel>
              <ItemValue className="items-center">
                <div className="flex items-center gap-2">
                  <Badge variant="code" className="flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    {tool.credentialReferenceId}
                  </Badge>
                  <ExternalLink
                    href={`/${tenantId}/projects/${projectId}/credentials/${tool.credentialReferenceId}`}
                    className="text-xs"
                  >
                    view credential
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
                <ItemValue>{formatDateTimeTable(tool.expiresAt, { local: true })}</ItemValue>
              </div>
            )}
          </div>
        )}

        {/* GitHub Access Section (for GitHub Work Apps only) */}
        {isGitHubWorkapp(tool) && (
          <WorkAppGitHubAccessSection
            tool={tool}
            tenantId={tenantId}
            projectId={projectId}
            canEdit={canEdit}
          />
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
