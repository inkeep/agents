'use client';

import { Check, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { type Control, type FieldPath, useController } from 'react-hook-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { ToolOverrideDialog } from './tool-override-dialog';
import { ToolSelectorItem } from './tool-selector-item';

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

  const handleToolToggle = useCallback(
    (toolName: string, checked: boolean) => {
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
    },
    [availableTools, safeToolsConfig, setToolsConfig]
  );

  const handleRemoveOverride = useCallback(
    (toolName: string) => {
      onToolOverrideChange?.(toolName, {});
    },
    [onToolOverrideChange]
  );

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

  return (
    <>
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
            <div className="mt-2 min-w-0">
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
                      const override = toolOverrides[tool.name];
                      const displayName = override?.displayName || tool.name;
                      const descriptionText = override?.description || tool.description;

                      return (
                        <ToolSelectorItem
                          key={tool.name}
                          toolName={tool.name}
                          override={override}
                          originalTool={tool}
                          displayName={displayName}
                          description={descriptionText}
                          isChecked={isChecked}
                          disabled={disabled}
                          hasOverride={!!override}
                          onToggle={handleToolToggle}
                          onEdit={setEditingTool}
                          onRemoveOverride={handleRemoveOverride}
                        />
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
    </>
  );
}
