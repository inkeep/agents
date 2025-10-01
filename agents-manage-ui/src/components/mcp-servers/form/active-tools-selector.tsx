'use client';

import { Check, X } from 'lucide-react';
import { useMemo } from 'react';
import { type Control, type FieldPath, useController } from 'react-hook-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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

  return (
    <FormField
      control={control}
      name={name}
      render={() => (
        <FormItem>
          <FormLabel>
            {label}
            <Badge variant="code" className="border-none px-2 text-[10px] text-muted-foreground">
              {getSelectedCount()}
            </Badge>
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

                    return (
                      <div
                        key={tool.name}
                        className="space-y-2 flex items-start gap-6 border-b last:border-b-0 py-4 px-6 relative"
                      >
                        <div className="flex items-center h-[22px]">
                          <Checkbox
                            checked={isChecked}
                            disabled={disabled}
                            className="mb-0"
                            onClick={() => !disabled && handleToolToggle(tool.name, !isChecked)}
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Badge
                            variant={isChecked ? 'primary' : 'code'}
                            className={`font-mono font-medium text-xs cursor-pointer transition-colors ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                            onClick={() => !disabled && handleToolToggle(tool.name, !isChecked)}
                          >
                            {tool.name}
                          </Badge>
                          <Tooltip delayDuration={800}>
                            <TooltipTrigger asChild>
                              <p className="text-sm text-muted-foreground line-clamp-1">
                                {tool.description}
                              </p>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" align="start">
                              {tool.description}
                            </TooltipContent>
                          </Tooltip>
                        </div>
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
