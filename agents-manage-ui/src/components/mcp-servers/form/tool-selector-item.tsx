'use client';

import type { McpToolDefinition, ToolSimplifyConfig } from '@inkeep/agents-core';
import { GitCompare, MoreVertical, Pencil, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ToolOverrideDiff } from './tool-override-diff';

interface ToolSelectorItemProps {
  toolName: string;
  override?: ToolSimplifyConfig;
  originalTool: McpToolDefinition;
  displayName: string;
  description?: string;
  isChecked: boolean;
  disabled: boolean;
  hasOverride: boolean;
  onToggle: (toolName: string, checked: boolean) => void;
  onEdit: (toolName: string) => void;
  onRemoveOverride: (toolName: string) => void;
}

export function ToolSelectorItem({
  toolName,
  override,
  originalTool,
  displayName,
  description,
  isChecked,
  disabled,
  hasOverride,
  onToggle,
  onEdit,
  onRemoveOverride,
}: ToolSelectorItemProps) {
  'use memo';
  const [isCompareOpen, setIsCompareOpen] = useState(false);

  return (
    <div className="border-b last:border-b-0">
      <div className="flex items-start gap-4 py-4 px-6">
        <div className="flex items-center h-[22px] relative">
          <Checkbox
            checked={isChecked}
            disabled={disabled}
            className="mb-0"
            onClick={() => !disabled && onToggle(toolName, !isChecked)}
          />
        </div>

        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <div className="flex items-center gap-2 justify-between min-w-0">
            <Badge
              variant={isChecked ? 'primary' : 'code'}
              className={`font-mono font-medium text-xs cursor-pointer rounded-sm transition-colors truncate inline-block min-w-0 shrink ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => !disabled && onToggle(toolName, !isChecked)}
            >
              {displayName}
            </Badge>
            <div className="flex items-center gap-2">
              {hasOverride && (
                <Badge variant="violet" className="uppercase">
                  Modified
                </Badge>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" className="h-6 w-6 p-0" type="button">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(toolName)}>
                    <Pencil className="size-4" />
                    Edit
                  </DropdownMenuItem>
                  {hasOverride && (
                    <>
                      <DropdownMenuItem onClick={() => setIsCompareOpen(true)}>
                        <GitCompare className="size-4" />
                        Compare to original
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => onRemoveOverride(toolName)}
                      >
                        <Undo2 className="size-4" />
                        Reset to original
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <Tooltip delayDuration={800}>
            <TooltipTrigger asChild>
              <p className="text-sm text-muted-foreground line-clamp-1">{description}</p>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="start">
              {description}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      {isCompareOpen && override && (
        <ToolOverrideDiff
          override={override}
          originalTool={originalTool}
          isOpen={isCompareOpen}
          setIsOpen={setIsCompareOpen}
        />
      )}
    </div>
  );
}
