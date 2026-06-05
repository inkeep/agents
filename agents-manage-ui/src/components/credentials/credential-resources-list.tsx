'use client';

import type { ExternalAgentApiSelect, McpTool } from '@inkeep/agents-core';
import Link from 'next/link';
import { Label } from '@/components/ui/label';
import { useMcpToolStatusQuery } from '@/lib/query/mcp-tools';

interface AppReaderInfo {
  id: string;
  name: string;
  type: string;
}

interface CredentialResourcesListProps {
  tools?: McpTool[];
  externalAgents?: ExternalAgentApiSelect[];
  apps?: AppReaderInfo[];
  toolId?: string;
  label?: string;
  tenantId?: string;
  projectId?: string;
}

interface ToolItemProps {
  tool: McpTool;
  tenantId?: string;
  projectId?: string;
}

interface ExternalAgentItemProps {
  externalAgent: ExternalAgentApiSelect;
  tenantId?: string;
  projectId?: string;
}

function ToolItem({ tool, tenantId, projectId }: ToolItemProps) {
  const canNavigate = tenantId && projectId;
  const href = canNavigate
    ? `/${tenantId}/projects/${projectId}/mcp-servers/${tool.id}`
    : undefined;

  const content = (
    <>
      <div className="flex items-center gap-3">
        <div>
          <p className="font-medium text-sm">{tool.name}</p>
          <p className="text-xs text-muted-foreground">
            {tool.config.type === 'mcp' ? tool.config.mcp.server.url : ''}
          </p>
        </div>
      </div>
    </>
  );

  if (canNavigate && href) {
    return (
      <Link
        href={href}
        className="flex items-center justify-between p-3 bg-background border rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="flex items-center justify-between p-3 bg-background border rounded-md">
      {content}
    </div>
  );
}

function ExternalAgentItem({ externalAgent, tenantId, projectId }: ExternalAgentItemProps) {
  const canNavigate = tenantId && projectId;
  const href = canNavigate
    ? `/${tenantId}/projects/${projectId}/external-agents/${externalAgent.id}`
    : undefined;

  const content = (
    <>
      <div className="flex items-center gap-3">
        <div>
          <p className="font-medium text-sm">{externalAgent.name}</p>
          <p className="text-xs text-muted-foreground">{externalAgent.baseUrl}</p>
        </div>
      </div>
    </>
  );

  if (canNavigate && href) {
    return (
      <Link
        href={href}
        className="flex items-center justify-between p-3 bg-background border rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="flex items-center justify-between p-3 bg-background border rounded-md">
      {content}
    </div>
  );
}

function AppItem({
  app,
  tenantId,
  projectId,
}: {
  app: AppReaderInfo;
  tenantId?: string;
  projectId?: string;
}) {
  const canNavigate = tenantId && projectId;
  const href = canNavigate ? `/${tenantId}/projects/${projectId}/apps` : undefined;

  const content = (
    <div className="flex items-center gap-3">
      <div>
        <p className="font-medium text-sm">{app.name}</p>
        <p className="text-xs text-muted-foreground">{app.type}</p>
      </div>
    </div>
  );

  if (canNavigate && href) {
    return (
      <Link
        href={href}
        className="flex items-center justify-between p-3 bg-background border rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="flex items-center justify-between p-3 bg-background border rounded-md">
      {content}
    </div>
  );
}

export function CredentialResourcesList({
  tools,
  externalAgents,
  apps,
  toolId,
  label = 'Resources using this credential',
  tenantId,
  projectId,
}: CredentialResourcesListProps) {
  const canFetchTool = !!(toolId && tenantId && projectId);
  const { data: fetchedTool, isFetching: isFetchingTool } = useMcpToolStatusQuery({
    tenantId: tenantId ?? '',
    projectId: projectId ?? '',
    toolId: toolId ?? '',
    enabled: canFetchTool,
  });

  const resolvedTools = toolId ? (fetchedTool ? [fetchedTool] : []) : tools;
  const hasTools = resolvedTools && resolvedTools.length > 0;
  const hasExternalAgents = externalAgents && externalAgents.length > 0;
  const hasApps = apps && apps.length > 0;
  const hasAnyResources = hasTools || hasExternalAgents || hasApps;

  return (
    <div className="space-y-3">
      <Label>{label}</Label>
      {hasAnyResources ? (
        <div className="space-y-4">
          {isFetchingTool && canFetchTool && (
            <div className="text-sm text-muted-foreground p-3 py-2">Loading...</div>
          )}
          {hasTools && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                MCP Servers
              </p>
              {resolvedTools.map((tool) => (
                <ToolItem key={tool.id} tool={tool} tenantId={tenantId} projectId={projectId} />
              ))}
            </div>
          )}
          {hasExternalAgents && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                External Agents
              </p>
              {externalAgents.map((agent) => (
                <ExternalAgentItem
                  key={agent.id}
                  externalAgent={agent}
                  tenantId={tenantId}
                  projectId={projectId}
                />
              ))}
            </div>
          )}
          {hasApps && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Apps
              </p>
              {apps?.map((app) => (
                <AppItem key={app.id} app={app} tenantId={tenantId} projectId={projectId} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground p-3 py-2 bg-gray-100/80 dark:bg-sidebar rounded-md">
          No resources are currently using this credential
        </div>
      )}
    </div>
  );
}
