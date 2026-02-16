'use client';

import { Loader2, MoreVertical, Trash2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ItemCardContent,
  ItemCardFooter,
  ItemCardHeader,
  ItemCardLink,
  ItemCardRoot,
  ItemCardTitle,
} from '@/components/ui/item-card';
import { useProjectPermissions } from '@/contexts/project';
import { deleteToolAction } from '@/lib/actions/tools';
import { useMcpToolStatusQuery } from '@/lib/query/mcp-tools';
import { toast } from '@/lib/toast';
import type { MCPTool } from '@/lib/types/tools';
import { getActiveTools } from '@/lib/utils/active-tools';
import { formatDate } from '@/lib/utils/format-date';

import { Badge } from '../ui/badge';
import { DeleteConfirmation } from '../ui/delete-confirmation';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { MCPToolImage } from './mcp-tool-image';

// URL Display Component with ellipsis and tooltip
function URLDisplay({ url }: { url: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="rounded py-1 min-w-0">
          <code className="text-sm text-muted-foreground block truncate">{url}</code>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="max-w-md">
        <code className="text-xs break-all">{url}</code>
      </TooltipContent>
    </Tooltip>
  );
}

interface MCPToolDialogMenuProps {
  toolId: string;
  toolName?: string;
}

function MCPToolDialogMenu({ toolId, toolName }: MCPToolDialogMenuProps) {
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();

  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
  };

  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      const result = await deleteToolAction(tenantId, projectId, toolId);
      if (result.success) {
        setIsOpen(false);
        toast.success('MCP server deleted.');
      } else {
        toast.error('Failed to delete MCP server.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className=" p-0 hover:bg-accent hover:text-accent-foreground rounded-sm -mr-2"
          >
            <MoreVertical className="h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-48 shadow-lg border border-border bg-popover/95 backdrop-blur-sm"
        >
          <DialogTrigger asChild>
            <DropdownMenuItem className="text-destructive hover:!bg-destructive/10 dark:hover:!bg-destructive/20 hover:!text-destructive cursor-pointer">
              <Trash2 className="size-4 text-destructive" />
              Delete
            </DropdownMenuItem>
          </DialogTrigger>
        </DropdownMenuContent>
      </DropdownMenu>
      {isOpen && (
        <DeleteConfirmation
          itemName={toolName || 'this MCP server'}
          isSubmitting={isSubmitting}
          onDelete={handleDelete}
        />
      )}
    </Dialog>
  );
}

export function MCPToolItem({
  tenantId,
  projectId,
  tool: initialTool,
}: {
  tenantId: string;
  projectId: string;
  tool: MCPTool;
}) {
  const { canEdit } = useProjectPermissions();
  const linkPath = `/${tenantId}/projects/${projectId}/mcp-servers/${initialTool.id}`;

  const { data: fetchedTool, isFetching: isLoadingStatus } = useMcpToolStatusQuery({
    tenantId,
    projectId,
    toolId: initialTool.id,
  });

  const tool = fetchedTool ?? initialTool;

  const activeTools = getActiveTools({
    availableTools: tool.availableTools,
    activeTools: tool.config.type === 'mcp' ? tool.config.mcp.activeTools : undefined,
  });

  return (
    <ItemCardRoot>
      <ItemCardHeader>
        <ItemCardLink href={linkPath} className="min-w-0">
          <ItemCardTitle className="text-md flex items-center gap-3 min-w-0">
            <MCPToolImage
              imageUrl={tool.imageUrl}
              name={tool.name}
              size={24}
              className="mt-0.5 flex-shrink-0"
            />
            <span className="flex-1 min-w-0 text-base font-medium truncate">{tool.name}</span>
          </ItemCardTitle>
        </ItemCardLink>
        {canEdit && <MCPToolDialogMenu toolId={tool.id} toolName={tool.name} />}
      </ItemCardHeader>
      <ItemCardContent>
        <div className="space-y-3 min-w-0">
          <URLDisplay url={tool.config.type === 'mcp' ? tool.config.mcp.server.url : ''} />

          {/* Key metrics in a structured layout */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Credential scope badge */}
            <Badge variant="code" className="uppercase bg-transparent">
              {tool.credentialScope === 'user' ? 'User' : 'Project'}
            </Badge>

            {isLoadingStatus && (
              <Badge variant="code" className="flex items-center gap-1 uppercase bg-transparent">
                <Loader2 className="size-3 animate-spin" />
                Loading...
              </Badge>
            )}

            {!isLoadingStatus && (tool.status === 'unhealthy' || tool.status === 'unknown') && (
              <Badge variant="error">{tool.status}</Badge>
            )}

            {!isLoadingStatus && tool.status === 'healthy' && (
              <Badge variant="success">{tool.status}</Badge>
            )}

            {!isLoadingStatus && tool.status === 'unavailable' && (
              <Badge variant="warning">Unavailable</Badge>
            )}

            {!isLoadingStatus && tool.status === 'needs_auth' && (
              <div className="flex items-center gap-2">
                <Badge variant="warning">Needs Login</Badge>
              </div>
            )}

            {!isLoadingStatus && (
              <Badge variant="code" className="uppercase bg-transparent">
                {activeTools?.length ?? 0} Active tool
                {activeTools?.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>
        <ItemCardFooter
          footerText={tool.createdAt ? `Created ${formatDate(tool.createdAt)}` : 'Created recently'}
        />
      </ItemCardContent>
    </ItemCardRoot>
  );
}
