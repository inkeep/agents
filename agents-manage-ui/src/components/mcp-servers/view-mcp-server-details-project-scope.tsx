'use client';

import { ArrowRight, Lock, MoreVertical, Pencil, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ItemCardContent,
  ItemCardHeader,
  ItemCardLink,
  ItemCardRoot,
  ItemCardTitle,
} from '@/components/ui/item-card';
import { useOAuthLogin } from '@/hooks/use-oauth-login';
import type { Credential } from '@/lib/api/credentials';
import { useProjectPermissionsQuery } from '@/lib/query/projects';
import type { MCPTool } from '@/lib/types/tools';
import { Button } from '../ui/button';
import { CopyableMultiLineCode } from '../ui/copyable-multi-line-code';
import { CopyableSingleLineCode } from '../ui/copyable-single-line-code';
import { AvailableToolsCard } from './available-tools-card';
import { DisconnectCredentialConfirmation } from './disconnect-credential-confirmation';
import { MCPToolImage } from './mcp-tool-image';
import {
  ActiveToolBadge,
  formatDate,
  getStatusBadgeVariant,
  ItemLabel,
  isExpired,
} from './view-mcp-server-details-shared';
import { isGitHubWorkapp, WorkAppGitHubAccessSection } from './work-app-github-access-section';
import { isSlackWorkapp, WorkAppSlackAccessSection } from './work-app-slack-access-section';

export function ViewMCPServerDetailsProjectScope({
  tool,
  credential,
  tenantId,
  projectId,
}: {
  tool: MCPTool;
  credential?: Credential | null;
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
  const {
    data: { canEdit },
  } = useProjectPermissionsQuery();

  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);

  const canDisconnect = !!tool.credentialReferenceId && tool.status !== 'needs_auth';

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MCPToolImage
            imageUrl={tool.imageUrl}
            name={tool.name}
            size={24}
            className="rounded-md"
          />
          <h2 className="text-base font-medium tracking-tight">{tool.name}</h2>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/${tenantId}/projects/${projectId}/mcp-servers/${tool.id}/edit`}>
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </Link>
          </Button>
        )}
      </div>

      {/* Overview group */}
      <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <div className="space-y-1">
            <ItemLabel>Status</ItemLabel>
            <Badge className="uppercase" variant={getStatusBadgeVariant(tool.status)}>
              {tool.status === 'needs_auth'
                ? 'Needs Login'
                : tool.status === 'unavailable'
                  ? 'Unavailable'
                  : tool.status}
            </Badge>
          </div>
          {(tool.config as any).mcp.transport && (
            <div className="space-y-1">
              <ItemLabel>Transport</ItemLabel>
              <Badge variant="code">{(tool.config as any).mcp.transport.type}</Badge>
            </div>
          )}
          <div className="space-y-1">
            <ItemLabel>Created</ItemLabel>
            <p className="text-sm">{tool.createdAt ? formatDate(tool.createdAt) : 'N/A'}</p>
          </div>
          <div className="space-y-1">
            <ItemLabel>Updated</ItemLabel>
            <p className="text-sm">{tool.updatedAt ? formatDate(tool.updatedAt) : 'N/A'}</p>
          </div>
        </div>
      </div>

      {/* Project Connection */}
      {!isGitHubWorkapp(tool) &&
        !isSlackWorkapp(tool) &&
        (tool.credentialReferenceId || tool.status === 'needs_auth') && (
          <div className="space-y-2">
            <ItemLabel>Project Connection</ItemLabel>

            {tool.credentialReferenceId ? (
              <ItemCardRoot>
                <ItemCardHeader>
                  <ItemCardLink
                    href={`/${tenantId}/projects/${projectId}/credentials/${tool.credentialReferenceId}`}
                    className="min-w-0"
                  >
                    <ItemCardTitle className="text-sm flex items-center gap-2 min-w-0">
                      <Lock className="w-4 h-4 shrink-0" />
                      <span className="font-medium break-all">
                        {credential?.name || tool.credentialReferenceId}
                      </span>
                    </ItemCardTitle>
                  </ItemCardLink>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="flex items-center gap-1.5">
                      <Users className="w-3 h-3" />
                      Project
                    </Badge>
                    {canDisconnect && canEdit && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="p-0 hover:bg-accent hover:text-accent-foreground rounded-sm -mr-2"
                          >
                            <MoreVertical className="h-4 w-4 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-48 shadow-lg border border-border bg-popover/95 backdrop-blur-sm"
                        >
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setShowDisconnectDialog(true)}
                          >
                            <Trash2 />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </ItemCardHeader>
                <ItemCardContent>
                  <div className="relative flex items-end justify-between">
                    <div className="space-y-0.5 text-xs text-muted-foreground">
                      {credential?.createdAt && <p>Connected {formatDate(credential.createdAt)}</p>}
                      {credential?.createdBy && <p>Connected By {credential.createdBy}</p>}
                      {tool.expiresAt && isExpired(tool.expiresAt) && (
                        <p>Expired {formatDate(tool.expiresAt)}</p>
                      )}
                    </div>
                    <div className="opacity-0 group-hover:opacity-60 transform translate-x-1 group-hover:translate-x-0 transition-all duration-300">
                      <ArrowRight className="w-4 h-4 text-muted-foreground opacity-60" />
                    </div>
                  </div>
                </ItemCardContent>
              </ItemCardRoot>
            ) : tool.status === 'needs_auth' ? (
              <ItemCardRoot>
                <ItemCardHeader>
                  <ItemCardTitle className="text-sm flex items-center gap-2 min-w-0">
                    <Lock className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <span className="font-medium text-muted-foreground">Not connected</span>
                  </ItemCardTitle>
                  <Badge variant="outline" className="flex items-center gap-1.5">
                    <Users className="w-3 h-3" />
                    Project
                  </Badge>
                </ItemCardHeader>
                <ItemCardContent>
                  <p className="text-sm text-muted-foreground">
                    This server requires authentication. Connect a project-scoped credential.
                  </p>
                  <Button
                    size="sm"
                    className="mt-3 w-fit"
                    onClick={() => {
                      handleOAuthLogin({
                        toolId: tool.id,
                        mcpServerUrl: tool.config.mcp.server.url,
                        toolName: tool.name,
                        credentialScope: 'project',
                      });
                    }}
                  >
                    Connect
                  </Button>
                </ItemCardContent>
              </ItemCardRoot>
            ) : null}
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

      {/* Slack Access Section (for Slack Work Apps only) */}
      {isSlackWorkapp(tool) && (
        <WorkAppSlackAccessSection
          tool={tool}
          tenantId={tenantId}
          projectId={projectId}
          canEdit={canEdit}
        />
      )}

      {/* Last Error */}
      {tool.lastError && (
        <div className="space-y-1.5">
          <ItemLabel>Last Error</ItemLabel>
          <CopyableMultiLineCode code={tool.lastError} />
        </div>
      )}

      {/* Configuration */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <ItemLabel>Server URL</ItemLabel>
          {tool.config.type === 'mcp' && (
            <CopyableSingleLineCode code={tool.config.mcp.server.url} />
          )}
        </div>

        {tool.config.type === 'mcp' &&
          (tool.config.mcp.prompt || tool.capabilities?.serverInstructions) && (
            <div className="space-y-1.5">
              <ItemLabel>
                Prompt
                {!tool.config.mcp.prompt && tool.capabilities?.serverInstructions && (
                  <span className="font-normal normal-case tracking-normal ml-1">
                    (server default)
                  </span>
                )}
              </ItemLabel>
              <div className="text-sm bg-muted/50 p-3 rounded-md border whitespace-pre-wrap">
                {tool.config.mcp.prompt || tool.capabilities?.serverInstructions}
              </div>
            </div>
          )}
      </div>

      {/* Tools */}
      <div className="space-y-3">
        <div className="flex gap-2 items-center">
          <ItemLabel>Active Tools</ItemLabel>
          <Badge variant="count">
            {(tool.config as any).mcp.activeTools === undefined
              ? (tool.availableTools?.length ?? 0)
              : ((tool.config as any).mcp.activeTools?.length ?? 0)}
          </Badge>
        </div>
        {(tool.config as any).mcp.activeTools === undefined ? (
          tool.availableTools && tool.availableTools.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {tool.availableTools.map((toolInfo) => (
                <ActiveToolBadge key={toolInfo.name} toolName={toolInfo.name} isAvailable />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No tools available</p>
          )
        ) : (tool.config as any).mcp.activeTools &&
          (tool.config as any).mcp.activeTools.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {(tool.config as any).mcp.activeTools.map((toolName: string) => {
              const isAvailable = tool.availableTools?.some((t) => t.name === toolName) ?? false;
              return (
                <ActiveToolBadge key={toolName} toolName={toolName} isAvailable={isAvailable} />
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">None</p>
        )}
      </div>

      {/* Available Tools */}
      {tool.availableTools && tool.availableTools.length > 0 && (
        <AvailableToolsCard
          tools={tool.availableTools}
          activeTools={(tool.config as any).mcp.activeTools}
          toolOverrides={(tool.config as any).mcp.toolOverrides}
        />
      )}

      {showDisconnectDialog && tool.credentialReferenceId && (
        <DisconnectCredentialConfirmation
          tenantId={tenantId}
          projectId={projectId}
          credentialId={tool.credentialReferenceId}
          toolName={tool.name}
          setIsOpen={setShowDisconnectDialog}
        />
      )}
    </div>
  );
}
