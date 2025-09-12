'use client';

import { useParams } from 'next/navigation';
import type { MCPTool } from '@/lib/api/tools';
import { MCPToolItem } from './mcp-tool-item';

interface MCPToolsListProps {
  tools: MCPTool[];
}

export function MCPToolsList({ tools }: MCPToolsListProps) {
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
      {tools?.map((tool: MCPTool) => (
        <MCPToolItem key={tool.id} tenantId={tenantId} projectId={projectId} tool={tool} />
      ))}
    </div>
  );
}
