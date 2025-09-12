'use client';

import { Lock, LockOpen, MoreVertical, Trash2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { getActiveTools } from '@/app/utils/active-tools';
import { formatDate } from '@/app/utils/format-date';
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
import { deleteToolAction } from '@/lib/actions/tools';
import type { MCPTool } from '@/lib/api/tools';
import { getToolTypeAndName } from '@/lib/utils/mcp-utils';
import { Badge } from '../ui/badge';
import { CardTitle } from '../ui/card';
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
  tool,
}: {
  tenantId: string;
  projectId: string;
  tool: MCPTool;
}) {
  const linkPath = `/${tenantId}/projects/${projectId}/mcp-servers/${tool.id}`;

  const activeTools = getActiveTools({
    availableTools: tool.availableTools,
    activeTools: tool.config?.mcp?.activeTools,
  });

  return (
    <ItemCardRoot>
      <ItemCardHeader>
        <ItemCardLink href={linkPath}>
          <ItemCardTitle className="text-md">
            <div className="flex items-start gap-3">
              <MCPToolImage
                imageUrl={tool.imageUrl}
                name={tool.name}
                provider={getToolTypeAndName(tool).type}
                size={24}
                className="mt-0.5 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base truncate font-medium">
                  {getToolTypeAndName(tool).name || tool.name}
                </CardTitle>
              </div>
            </div>
          </ItemCardTitle>
        </ItemCardLink>
        <MCPToolDialogMenu toolId={tool.id} toolName={tool.name} />
      </ItemCardHeader>
      <ItemCardContent>
        <div className="space-y-3 min-w-0">
          <URLDisplay url={tool.config.mcp.server.url} />

          {/* Key metrics in a structured layout */}
          <div className="flex items-center gap-2 flex-wrap">
            {tool.status === 'needs_auth' ? (
              <div className="flex items-center gap-2">
                <Badge variant="warning">Needs Login</Badge>
              </div>
            ) : tool.credentialReferenceId ? (
              <Badge variant="success">
                <Lock className="w-3 h-3 mr-1" />
                Secured
              </Badge>
            ) : (
              <Badge variant="warning">
                <LockOpen className="w-3 h-3 mr-1" />
                Unsecured
              </Badge>
            )}
            <Badge variant="code" className="uppercase bg-transparent">
              {activeTools?.length ?? 0} Active tool
              {activeTools?.length !== 1 ? 's' : ''}
            </Badge>
          </div>
        </div>
        <ItemCardFooter
          footerText={`Created ${formatDate(typeof tool.createdAt === 'string' ? tool.createdAt : tool.createdAt.toISOString())}`}
        />
      </ItemCardContent>
    </ItemCardRoot>
  );
}
