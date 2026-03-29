'use client';

import { Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Control } from 'react-hook-form';
import { useFormState, useWatch } from 'react-hook-form';
import { CollapsibleSettings } from '@/components/agent/sidepane/collapsible-settings';
import { GenericInput } from '@/components/form/generic-input';
import { InfoCard } from '@/components/ui/info-card';
import { Label } from '@/components/ui/label';
import type { ProjectInput, ProjectOutput } from './validation';

interface ProjectStopWhenSectionProps {
  control: Control<ProjectInput, unknown, ProjectOutput>;
  disabled?: boolean;
}

export function ProjectStopWhenSection({ control, disabled }: ProjectStopWhenSectionProps) {
  const stopWhen = useWatch({ control, name: 'stopWhen' });
  const hasConfiguredStopWhen = !!(stopWhen?.transferCountIs || stopWhen?.stepCountIs);
  const [isOpen, setIsOpen] = useState(hasConfiguredStopWhen);

  const { errors } = useFormState({ control });
  const hasStopWhenErrors = !!(errors.stopWhen?.transferCountIs || errors.stopWhen?.stepCountIs);

  // Auto-open the collapsible when there are errors in the stopWhen section
  useEffect(() => {
    if (hasStopWhenErrors) {
      setIsOpen(true);
    }
  }, [hasStopWhenErrors]);

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">Execution limits</Label>
        <p className="text-sm text-muted-foreground mt-1">
          Set default execution limits that will be inherited by agents and sub agents in this
          project.
        </p>
      </div>
      <CollapsibleSettings
        open={isOpen}
        onOpenChange={setIsOpen}
        title="Configure Execution Limits"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Transfer Count Limit */}
          <div className="space-y-2">
            <GenericInput
              control={control}
              name="stopWhen.transferCountIs"
              description="Maximum number of agent transfers per conversation (agent-level, default: 10)"
              label="Max transfers"
              type="number"
              placeholder="10"
              min="1"
              disabled={disabled}
            />
          </div>

          {/* Step Count Limit */}
          <div className="space-y-2">
            <GenericInput
              control={control}
              name="stopWhen.stepCountIs"
              label="Max steps"
              type="number"
              placeholder="50"
              min="1"
              description="Maximum number of execution steps per agent (agent-level limit)"
              disabled={disabled}
            />
          </div>
        </div>
        <InfoCard title="How inheritance works:" Icon={Info}>
          <ul className="space-y-1.5 list-disc list-outside pl-4">
            <li>
              <span className="font-medium">transferCountIs</span>: Project → Agent only
              (agent-level limit)
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
      </CollapsibleSettings>
    </div>
  );
}
