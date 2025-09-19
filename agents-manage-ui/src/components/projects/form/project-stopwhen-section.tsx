'use client';

import { ChevronRight, Info } from 'lucide-react';
import type { Control } from 'react-hook-form';
import { useWatch } from 'react-hook-form';
import { GenericInput } from '@/components/form/generic-input';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { InfoCard } from '@/components/ui/info-card';
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

      <Collapsible defaultOpen={hasConfiguredStopWhen} className="border rounded-md bg-background">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="flex items-center justify-start gap-2 w-full group p-0 h-auto  hover:!bg-transparent transition-colors py-2 px-4"
          >
            <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
            Configure Execution Limits
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-6  mt-4 data-[state=closed]:animate-[collapsible-up_200ms_ease-out] data-[state=open]:animate-[collapsible-down_200ms_ease-out] overflow-hidden px-4 pb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Transfer Count Limit */}
            <div className="space-y-2">
              <GenericInput
                control={control}
                name="stopWhen.transferCountIs"
                description="Maximum number of agent transfers per conversation (graph-level, default: 10)"
                label="Max Transfers"
                type="number"
                placeholder="10"
                min="1"
              />
            </div>

            {/* Step Count Limit */}
            <div className="space-y-2">
              <GenericInput
                control={control}
                name="stopWhen.stepCountIs"
                label="Max Steps"
                type="number"
                placeholder="50"
                min="1"
                description="Maximum number of execution steps per agent (agent-level limit)"
              />
            </div>
          </div>
          <InfoCard title="How inheritance works:" Icon={Info}>
            <ul className="space-y-1.5 list-disc list-outside pl-4">
              <li>
                <span className="font-medium">transferCountIs</span>: Project → Graph only
                (graph-level limit)
              </li>
              <li>
                <span className="font-medium">stepCountIs</span>: Project → Agent only (agent-level
                limit)
              </li>
              <li>
                <span className="font-medium">Explicit settings</span> always take precedence over
                inherited values
              </li>
              <li>
                <span className="font-medium">Default fallback</span>: transferCountIs = 10 if no
                value is set
              </li>
              <li>
                <span className="font-medium">Error limit</span> is hardcoded to 3 errors across all
                levels
              </li>
            </ul>
          </InfoCard>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
