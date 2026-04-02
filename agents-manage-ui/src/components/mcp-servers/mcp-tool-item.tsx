'use client';

import { ArrowRight, Loader2, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
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
  ItemCardHeader,
  ItemCardLink,
  ItemCardRoot,
  ItemCardTitle,
} from '@/components/ui/item-card';
import { URLDisplay } from '@/components/url-display';
import { deleteToolAction } from '@/lib/actions/tools';
import { useMcpToolStatusQuery } from '@/lib/query/mcp-tools';
import { useProjectPermissionsQuery } from '@/lib/query/projects';
import type { MCPTool } from '@/lib/types/tools';
import { getActiveTools } from '@/lib/utils/active-tools';
import { formatDate } from '@/lib/utils/format-date';
import { Badge } from '../ui/badge';
import { DeleteConfirmation } from '../ui/delete-confirmation';
import { MCPToolImage } from './mcp-tool-image';

interface MCPToolDialogMenuProps {
  toolId: string;
  toolName?: string;
  editPath: string;
}

function MCPToolDialogMenu({ toolId, toolName, editPath }: MCPToolDialogMenuProps) {
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();

  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
  };

  const handleDelete = async () => {
    setIsSubmitting(true);
    const result = await deleteToolAction(tenantId, projectId, toolId);
    if (result.success) {
      setIsOpen(false);
      toast.success('MCP server deleted.');
    } else {
      toast.error('Failed to delete MCP server.');
    }
    setIsSubmitting(false);
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
          <DropdownMenuItem className="cursor-pointer" asChild>
            <Link href={editPath}>
              <Pencil className="size-4" />
              Edit
            </Link>
          </DropdownMenuItem>
          <DialogTrigger asChild>
            <DropdownMenuItem variant="destructive">
              <Trash2 />
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
  const {
    data: { canEdit },
  } = useProjectPermissionsQuery();
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
            <span className="font-medium break-all">{tool.name}</span>
          </ItemCardTitle>
        </ItemCardLink>
        {canEdit && (
          <MCPToolDialogMenu toolId={tool.id} toolName={tool.name} editPath={`${linkPath}/edit`} />
        )}
      </ItemCardHeader>
      <ItemCardContent>
        <div className="space-y-3 min-w-0">
          <URLDisplay>{tool.config.type === 'mcp' && tool.config.mcp.server.url}</URLDisplay>

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
        <div className="relative flex items-end justify-between">
          <div className="space-y-0.5">
            <div className="text-xs text-muted-foreground">
              {tool.createdAt ? `Created ${formatDate(tool.createdAt)}` : 'Created recently'}
            </div>
            {tool.createdBy && (
              <div className="text-xs text-muted-foreground">
                Last Connected By {tool.createdBy}
              </div>
            )}
          </div>
          <div className="opacity-0 group-hover:opacity-60 transform translate-x-1 group-hover:translate-x-0 transition-all duration-300">
            <ArrowRight className="w-4 h-4 text-muted-foreground opacity-60" />
          </div>
        </div>
      </ItemCardContent>
    </ItemCardRoot>
  );
}
