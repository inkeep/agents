'use client';

import { Lock, LockOpen, Pencil } from 'lucide-react';
import Link from 'next/link';
import { ExternalLink } from '@/components/ui/external-link';
import { Badge } from '@/components/ui/badge';
import type { MCPTool } from '@/lib/api/tools';
import { cn } from '@/lib/utils';
import { getOAuthLoginUrl } from '@/lib/utils/mcp-urls';
import { getToolTypeAndName } from '@/lib/utils/mcp-utils';
import { Button } from '../ui/button';
import { CopyableSingleLineCode } from '../ui/copyable-single-line-code';
import { AvailableToolsCard } from './available-tools-card';
import { MCPToolImage } from './mcp-tool-image';

export function ViewMCPServerDetails({
  tool,
  tenantId,
  projectId,
}: {
  tool: MCPTool;
  tenantId: string;
  projectId: string;
}) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'success';
      case 'unhealthy':
        return 'error';
      case 'disabled':
        return 'code';
      case 'needs_auth':
        return 'warning';
      default:
        return 'warning';
    }
  };

  const ItemLabel = ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => {
    return <div className={cn('text-sm font-medium leading-none', className)}>{children}</div>;
  };

  const ItemValue = ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => {
    return <div className={cn('flex w-full text-sm', className)}>{children}</div>;
  };

  // Handle OAuth login for MCP tools that need authentication
  const handleOAuthLogin = (toolId: string) => {
    try {
      // Get the OAuth URL and open in popup window
      const oauthUrl = getOAuthLoginUrl({ tenantId, projectId, id: toolId });
      const popup = window.open(
        oauthUrl,
        'oauth-popup',
        'width=600,height=700,scrollbars=yes,resizable=yes,status=yes,location=yes'
      );

      // Listen for OAuth success message from popup
      const handleMessage = (event: MessageEvent) => {
        if (event.data.type === 'oauth-success' && event.data.toolId === toolId) {
          // Clean up listener
          window.removeEventListener('message', handleMessage);
          // Refresh the page to show updated tool status
          window.location.reload();
        }
      };

      if (popup) {
        window.addEventListener('message', handleMessage);

        // Fallback: Monitor popup for closure
        const checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed);
            window.removeEventListener('message', handleMessage);
            // Only refresh if we didn't already get the success message
            window.location.reload();
          }
        }, 1000);
      }
    } catch (error) {
      console.error('OAuth login failed:', error);
    }
  };

  let provider: string | undefined;
  try {
    provider = getToolTypeAndName(tool).type;
  } catch (error) {
    console.error(error);
  }

  return (
    <div className="max-w-2xl mx-auto py-4 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MCPToolImage
            imageUrl={tool.imageUrl}
            name={tool.name}
            provider={provider}
            size={48}
            className="rounded-lg"
          />
          <div>
            <h2 className="text-xl font-medium tracking-tight">{tool.name}</h2>
            <p className="text-sm text-muted-foreground">MCP Server Details</p>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 space-y-8">
          <div className="space-y-2">
            <ItemLabel>Name</ItemLabel>
            <ItemValue>{tool.name}</ItemValue>
          </div>
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
                    handleOAuthLogin(tool.id);
                  }}
                >
                  Click to Login
                </Badge>
              ) : (
                <Badge className="uppercase" variant={getStatusBadgeVariant(tool.status)}>
                  {tool.status}
                </Badge>
              )}
            </ItemValue>
          </div>
          <div className="space-y-2">
            <ItemLabel>Created At</ItemLabel>
            <ItemValue>
              {formatDate(
                typeof tool.createdAt === 'string' ? tool.createdAt : tool.createdAt.toISOString()
              )}
            </ItemValue>
          </div>
          <div className="space-y-2">
            <ItemLabel>Updated At</ItemLabel>
            <ItemValue>
              {formatDate(
                typeof tool.updatedAt === 'string' ? tool.updatedAt : tool.updatedAt.toISOString()
              )}
            </ItemValue>
          </div>
        </div>
        {tool.imageUrl && (
          <div className="space-y-2">
            <ItemLabel>Image URL</ItemLabel>
            <ItemValue>
              {tool.imageUrl.startsWith('data:image/') ? 'Base64 encoded image' : tool.imageUrl}
            </ItemValue>
          </div>
        )}

        {/* Server URL */}
        <div className="space-y-2">
          <ItemLabel>Server URL</ItemLabel>
          <CopyableSingleLineCode code={tool.config.mcp.server.url} />
        </div>

        {/* Transport and Credential */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tool.config.mcp.transport && (
            <div className="space-y-2">
              <ItemLabel>Transport Type</ItemLabel>
              <ItemValue>
                {<Badge variant="code">{tool.config.mcp.transport.type}</Badge>}
              </ItemValue>
            </div>
          )}
          <div className="space-y-2">
            <ItemLabel>Credential</ItemLabel>
            <ItemValue className="items-center">
              {tool.credentialReferenceId ? (
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
              ) : (
                <Badge variant="warning" className="flex items-center gap-2">
                  <LockOpen className="w-4 h-4" />
                  Unsecured
                </Badge>
              )}
            </ItemValue>
          </div>
        </div>

        {/* Active Tools */}
        <div className="space-y-2">
          <div className="flex gap-2 items-center">
            <ItemLabel>Active Tools</ItemLabel>
            <Badge variant="code" className="border-none px-2 text-[10px] text-muted-foreground">
              {tool.config.mcp.activeTools === undefined
                ? (tool.availableTools?.length ?? 0)
                : (tool.config.mcp.activeTools?.length ?? 0)}
            </Badge>
          </div>
          <ItemValue>
            {tool.config.mcp.activeTools === undefined ? (
              // All tools are active (undefined means all)
              tool.availableTools && tool.availableTools.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {tool.availableTools.map((toolInfo) => (
                    <Badge key={toolInfo.name} className="" variant="primary">
                      {toolInfo.name}
                    </Badge>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No tools available</div>
              )
            ) : tool.config.mcp.activeTools && tool.config.mcp.activeTools.length > 0 ? (
              // Specific tools are active
              <div className="flex flex-wrap gap-2">
                {tool.config.mcp.activeTools.map((toolName) => (
                  <Badge key={toolName} className="" variant="primary">
                    {toolName}
                  </Badge>
                ))}
              </div>
            ) : (
              // No tools are active (empty array)
              <div className="text-sm text-muted-foreground">None</div>
            )}
          </ItemValue>
        </div>

        {/* Available Tools */}
        {tool.availableTools && tool.availableTools.length > 0 && (
          <AvailableToolsCard tools={tool.availableTools} />
        )}
      </div>
    </div>
  );
}
