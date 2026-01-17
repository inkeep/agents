'use client';

import { Check, ChevronDown, ChevronRight, X } from 'lucide-react';
import React, { useState } from 'react';
import { type Control, type FieldPath, useController } from 'react-hook-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ToolOverrideDialog } from './tool-override-dialog';

type ToolsConfig =
  | {
      type: 'all';
    }
  | {
      type: 'selective';
      tools: string[];
    };

interface ActiveToolsSelectorProps<
  TFieldValues extends Record<string, unknown> = Record<string, unknown>,
> {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  availableTools?: Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }>;
  description?: string;
  disabled?: boolean;
  toolOverrides?: Record<
    string,
    {
      displayName?: string;
      description?: string;
      schema?: any;
      transformation?: string | Record<string, string>;
    }
  >;
  onToolOverrideChange?: (toolName: string, override: any) => void;
}

export function ActiveToolsSelector<
  TFieldValues extends Record<string, unknown> = Record<string, unknown>,
>({
  control,
  name,
  label,
  availableTools = [],
  description,
  disabled = false,
  toolOverrides = {},
  onToolOverrideChange,
}: ActiveToolsSelectorProps<TFieldValues>) {
  // State for tracking which tools have expanded override details
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  // State for override dialog
  const [editingTool, setEditingTool] = useState<string | null>(null);

  // Control for toolsConfig discriminated union
  const {
    field: { value: toolsConfig, onChange: setToolsConfig },
    fieldState: { error: fieldError },
  } = useController({
    name,
    control,
  });

  // Safe accessor for toolsConfig with fallback
  const safeToolsConfig: ToolsConfig = useMemo(() => {
    if (typeof toolsConfig !== 'object' || toolsConfig === null || !('type' in toolsConfig)) {
      return { type: 'selective', tools: [] };
    }

    const obj = toolsConfig as Record<string, unknown>;

    if (obj.type === 'all') {
      return { type: 'all' };
    }

    if (obj.type === 'selective' && Array.isArray(obj.tools)) {
      return { type: 'selective', tools: obj.tools as string[] };
    }

    return { type: 'selective', tools: [] };
  }, [toolsConfig]);

  const handleSelectAll = () => {
    setToolsConfig({ type: 'all' });
  };

  const handleDeselectAll = () => {
    setToolsConfig({ type: 'selective', tools: [] });
  };

  const handleToolToggle = (toolName: string, checked: boolean) => {
    if (safeToolsConfig.type === 'all') {
      // When in "all" mode, unchecking creates selective list without that tool
      const allToolsExceptThis = availableTools
        .map((t) => t.name)
        .filter((name) => name !== toolName);
      setToolsConfig({
        type: 'selective',
        tools: checked ? [...allToolsExceptThis, toolName] : allToolsExceptThis,
      });
    } else {
      // Standard selective mode logic
      const newTools = checked
        ? [...safeToolsConfig.tools.filter((name) => name !== toolName), toolName]
        : safeToolsConfig.tools.filter((name) => name !== toolName);
      setToolsConfig({ type: 'selective', tools: newTools });
    }
  };

  const isToolSelected = (toolName: string): boolean => {
    switch (safeToolsConfig.type) {
      case 'all':
        // Only return true if the tool actually exists in availableTools
        return availableTools.some((tool) => tool.name === toolName);
      case 'selective':
        // Only return true if tool is selected AND still exists in availableTools
        return (
          safeToolsConfig.tools.includes(toolName) &&
          availableTools.some((tool) => tool.name === toolName)
        );
      default:
        return false;
    }
  };

  const getSelectedCount = (): number => {
    switch (safeToolsConfig.type) {
      case 'all':
        return availableTools.length;
      case 'selective':
        // Only count tools that still exist in availableTools
        return safeToolsConfig.tools.filter((toolName) =>
          availableTools.some((tool) => tool.name === toolName)
        ).length;
      default:
        return 0;
    }
  };

  const allToolsSelected = getSelectedCount() === availableTools.length;

  const toggleToolExpanded = (toolName: string) => {
    setExpandedTools((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(toolName)) {
        newSet.delete(toolName);
      } else {
        newSet.add(toolName);
      }
      return newSet;
    });
  };

  return (
    <React.Fragment>
      <FormField
        control={control}
        name={name}
        render={() => (
          <FormItem>
            <FormLabel>
              {label}
              <Badge variant="count">{getSelectedCount()}</Badge>
            </FormLabel>

            {description && <p className="text-sm text-muted-foreground">{description}</p>}
            <div className="mt-2">
              {availableTools.length === 0 && (
                <div className="text-sm text-muted-foreground border rounded-md p-3 py-2 bg-gray-100/80 dark:bg-sidebar">
                  No tools available from this server
                </div>
              )}
              {availableTools.length > 0 && (
                <>
                  <div className="flex items-center gap-2 justify-between py-3 px-6 rounded-t-lg border border-b-0">
                    <div className="text-sm">
                      {getSelectedCount()}{' '}
                      <span className="text-gray-400 dark:text-white/40">
                        / {availableTools.length} tool{availableTools.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    {allToolsSelected ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleDeselectAll}
                        disabled={disabled}
                      >
                        <X className="w-4 h-4 text-muted-foreground" />
                        Deselect all
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleSelectAll}
                        disabled={disabled}
                      >
                        <Check className="w-4 h-4 text-muted-foreground" />
                        Select all
                      </Button>
                    )}
                  </div>

                  {/* Individual Tool Selection */}
                  <div className="max-h-96 overflow-y-auto border rounded-lg rounded-t-none scrollbar-thin scrollbar-thumb-muted-foreground/30 dark:scrollbar-thumb-muted-foreground/50 scrollbar-track-transparent">
                    {availableTools.map((tool) => {
                      const isChecked = isToolSelected(tool.name);
                      const hasOverride = !!toolOverrides[tool.name];
                      const isExpanded = expandedTools.has(tool.name);
                      const override = toolOverrides[tool.name];

                      return (
                        <div key={tool.name} className="border-b last:border-b-0">
                          {/* Tool Header */}
                          <div className="flex items-start gap-4 py-4 px-6">
                            <div className="flex items-center h-[22px]">
                              <Checkbox
                                checked={isChecked}
                                disabled={disabled}
                                className="mb-0"
                                onClick={() => !disabled && handleToolToggle(tool.name, !isChecked)}
                              />
                            </div>

                            <div className="flex-1 flex flex-col gap-2">
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant={isChecked ? 'primary' : 'code'}
                                  className={`font-mono font-medium text-xs cursor-pointer transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  onClick={() =>
                                    !disabled && handleToolToggle(tool.name, !isChecked)
                                  }
                                >
                                  {override?.displayName || tool.name}
                                </Badge>

                                {hasOverride && (
                                  <Badge
                                    variant="destructive"
                                    className="text-xs cursor-pointer hover:bg-destructive/80 transition-colors"
                                    onClick={() => setEditingTool(tool.name)}
                                  >
                                    Override
                                  </Badge>
                                )}

                                {!hasOverride && onToolOverrideChange && (
                                  <Badge
                                    variant="outline"
                                    className="text-xs cursor-pointer hover:bg-muted transition-colors"
                                    onClick={() => setEditingTool(tool.name)}
                                  >
                                    + Override
                                  </Badge>
                                )}
                              </div>

                              <Tooltip delayDuration={800}>
                                <TooltipTrigger asChild>
                                  <p className="text-sm text-muted-foreground line-clamp-1">
                                    {override?.description || tool.description}
                                  </p>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" align="start">
                                  {override?.description || tool.description}
                                </TooltipContent>
                              </Tooltip>
                            </div>

                            {hasOverride && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => toggleToolExpanded(tool.name)}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                          </div>

                          {/* Override Details - Expanded */}
                          {hasOverride && isExpanded && (
                            <div className="px-6 pb-4 space-y-3 bg-muted/30">
                              {/* Name Changes */}
                              {override.displayName && override.displayName !== tool.name && (
                                <div>
                                  <div className="text-sm font-medium mb-1">Name Override</div>
                                  <div className="text-sm bg-background p-2 rounded border">
                                    <span className="text-muted-foreground">Original:</span>{' '}
                                    <code>{tool.name}</code>
                                    <br />
                                    <span className="text-muted-foreground">Display:</span>{' '}
                                    <code>{override.displayName}</code>
                                  </div>
                                </div>
                              )}

                              {/* Description Changes */}
                              {override.description &&
                                override.description !== tool.description && (
                                  <div>
                                    <div className="text-sm font-medium mb-1">
                                      Description Override
                                    </div>
                                    <div className="text-sm bg-background p-2 rounded border">
                                      {override.description}
                                    </div>
                                  </div>
                                )}

                              {/* Schema Override */}
                              {override.schema && (
                                <div>
                                  <div className="text-sm font-medium mb-1">Schema Override</div>
                                  <div className="text-xs bg-background p-2 rounded border font-mono">
                                    Simplified parameters defined
                                  </div>
                                </div>
                              )}

                              {/* Edit/Remove Actions */}
                              <div className="flex gap-2 pt-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setEditingTool(tool.name)}
                                  className="h-8 text-xs"
                                >
                                  Edit Override
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const newOverrides = { ...toolOverrides };
                                    delete newOverrides[tool.name];
                                    onToolOverrideChange?.(tool.name, {});
                                    setExpandedTools((prev) => {
                                      const newSet = new Set(prev);
                                      newSet.delete(tool.name);
                                      return newSet;
                                    });
                                  }}
                                  className="h-8 text-xs text-destructive hover:text-destructive"
                                >
                                  Remove Override
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
            <FormMessage>{fieldError?.message}</FormMessage>
          </FormItem>
        )}
      />

      {/* Tool Override Dialog */}
      {editingTool && (
        <ToolOverrideDialog
          isOpen={true}
          onOpenChange={(open) => !open && setEditingTool(null)}
          toolName={editingTool}
          override={toolOverrides[editingTool]}
          originalTool={availableTools.find((t) => t.name === editingTool)}
          onSave={(override) => {
            if (onToolOverrideChange) {
              onToolOverrideChange(editingTool, override);
            }
            setEditingTool(null);
          }}
        />
      )}
    </React.Fragment>
  );
}
