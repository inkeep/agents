'use client';

import { useMemo, useState } from 'react';
import { type Control, type FieldPath, useController } from 'react-hook-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

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
}: ActiveToolsSelectorProps<TFieldValues>) {
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set());

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

  const toggleDescriptionExpansion = (toolName: string) => {
    const newExpanded = new Set(expandedDescriptions);
    if (newExpanded.has(toolName)) {
      newExpanded.delete(toolName);
    } else {
      newExpanded.add(toolName);
    }
    setExpandedDescriptions(newExpanded);
  };

  const renderSelectedTools = () => {
    switch (safeToolsConfig.type) {
      case 'all':
        return (
          <div className="flex flex-wrap gap-2">
            {availableTools.map((tool) => (
              <Badge key={tool.name} variant="secondary" className="text-xs">
                {tool.name}
              </Badge>
            ))}
          </div>
        );
      case 'selective': {
        // Only show tools that still exist in availableTools
        const validSelectedTools = safeToolsConfig.tools.filter((toolName) =>
          availableTools.some((tool) => tool.name === toolName)
        );
        return validSelectedTools.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {validSelectedTools.map((toolName: string) => (
              <Badge key={toolName} variant="secondary" className="text-xs">
                {toolName}
              </Badge>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">None</div>
        );
      }
      default:
        return <div className="text-sm text-muted-foreground">None</div>;
    }
  };

  return (
    <FormField
      control={control}
      name={name}
      render={() => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
          <div className="space-y-4">
            {availableTools.length === 0 && (
              <div className="text-sm text-muted-foreground p-4 border rounded-md bg-muted/30">
                No tools available from this server
              </div>
            )}
            {availableTools.length > 0 && (
              <>
                {/* Action Buttons */}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="normal-case"
                    onClick={handleSelectAll}
                    disabled={disabled}
                  >
                    Select all
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="normal-case"
                    onClick={handleDeselectAll}
                    disabled={disabled}
                  >
                    Deselect all
                  </Button>
                </div>

                {/* Selected Tools Status */}
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-2">
                    Selected tools ({getSelectedCount()}):
                  </div>
                  {renderSelectedTools()}
                </div>

                {/* Individual Tool Selection */}
                <div className="space-y-3 max-h-96 overflow-y-auto border rounded-md p-4">
                  {availableTools.map((tool) => {
                    const isChecked = isToolSelected(tool.name);

                    return (
                      <div key={tool.name} className="space-y-2">
                        <Badge
                          variant={isChecked ? 'default' : 'outline'}
                          className={`font-mono text-xs cursor-pointer transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-accent'}`}
                          onClick={() => !disabled && handleToolToggle(tool.name, !isChecked)}
                        >
                          {tool.name}
                        </Badge>
                        {tool.description && (
                          <button
                            type="button"
                            className={`text-xs text-muted-foreground cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 transition-colors text-left w-full ${expandedDescriptions.has(tool.name) ? '' : 'line-clamp-2'}`}
                            onClick={() => toggleDescriptionExpansion(tool.name)}
                            title="Click to expand/collapse"
                          >
                            {tool.description}
                          </button>
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
  );
}
