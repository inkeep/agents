'use client';

import { ChevronRight } from 'lucide-react';
import type { Control } from 'react-hook-form';
import { useWatch } from 'react-hook-form';
import { GenericInput } from '@/components/form/generic-input';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import type { ProjectFormData } from './validation';

interface ProjectStopWhenSectionProps {
  control: Control<ProjectFormData>;
}

export function ProjectStopWhenSection({ control }: ProjectStopWhenSectionProps) {
  // Check if any stopWhen values are configured to determine default open state
  const stopWhen = useWatch({ control, name: 'stopWhen' });
  const hasConfiguredStopWhen = !!(stopWhen?.transferCountIs || stopWhen?.stepCountIs);

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">Execution Limits</Label>
        <p className="text-sm text-muted-foreground mt-1">
          Set default execution limits that will be inherited by graphs and agents in this project
        </p>
      </div>

      <Collapsible defaultOpen={hasConfiguredStopWhen}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex items-center justify-start gap-2 w-full group"
          >
            <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
            Configure Execution Limits
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-6 mt-4 border rounded-md p-4 bg-muted/30">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Transfer Count Limit */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Max Transfers</Label>
              <p className="text-xs text-muted-foreground">
                Maximum number of agent transfers per conversation (graph-level, default: 10)
              </p>
              <GenericInput<ProjectFormData>
                control={control}
                name="stopWhen.transferCountIs"
                label="Max Transfers"
                type="number"
                placeholder="10"
                min="1"
              />
            </div>

            {/* Step Count Limit */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Max Steps</Label>
              <p className="text-xs text-muted-foreground">
                Maximum number of execution steps per agent (agent-level limit)
              </p>
              <GenericInput<ProjectFormData>
                control={control}
                name="stopWhen.stepCountIs"
                label="Max Steps"
                type="number"
                placeholder="50"
                min="1"
              />
            </div>
          </div>

          <div className="text-xs text-muted-foreground p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md border border-blue-200 dark:border-blue-800">
            <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">
              How inheritance works:
            </p>
            <ul className="space-y-1 text-blue-800 dark:text-blue-200">
              <li>
                • <strong>transferCountIs</strong>: Project → Graph only (graph-level limit)
              </li>
              <li>
                • <strong>stepCountIs</strong>: Project → Agent only (agent-level limit)
              </li>
              <li>
                • <strong>Explicit settings</strong> always take precedence over inherited values
              </li>
              <li>
                • <strong>Default fallback</strong>: transferCountIs = 10 if no value is set
              </li>
              <li>
                • <strong>Error limit</strong> is hardcoded to 3 errors across all levels
              </li>
            </ul>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
