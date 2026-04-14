'use client';

import { ChevronRight, Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Control } from 'react-hook-form';
import { useFormState, useWatch } from 'react-hook-form';
import { GenericInput } from '@/components/form/generic-input';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { InfoCard } from '@/components/ui/info-card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { ProjectFormData } from './validation';

interface ProjectImprovementSectionProps {
  control: Control<ProjectFormData>;
  disabled?: boolean;
}

export function ProjectImprovementSection({ control, disabled }: ProjectImprovementSectionProps) {
  const improvementSettings = useWatch({ control, name: 'improvementSettings' });
  const isEnabled = improvementSettings?.enabled ?? false;
  const [isOpen, setIsOpen] = useState(isEnabled);

  const { errors } = useFormState({ control });
  const hasErrors = !!errors.improvementSettings;

  useEffect(() => {
    if (hasErrors) setIsOpen(true);
  }, [hasErrors]);

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium">Improvement Agent</Label>
        <p className="text-sm text-muted-foreground mt-1">
          Automatically improve agents based on user feedback. The improvement agent analyzes
          feedback patterns and proposes configuration changes on a branch for your review.
        </p>
      </div>

      <Collapsible
        open={isOpen}
        onOpenChange={setIsOpen}
        className="border rounded-md bg-background"
      >
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="flex items-center justify-start gap-2 w-full group p-0 h-auto hover:!bg-transparent transition-colors py-2 px-4"
          >
            <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
            Configure Improvement Settings
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-6 mt-4 data-[state=closed]:animate-[collapsible-up_200ms_ease-out] data-[state=open]:animate-[collapsible-down_200ms_ease-out] overflow-hidden px-4 pb-6">
          <FormField
            control={control}
            name="improvementSettings.enabled"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <FormLabel>Enable Improvements</FormLabel>
                  <FormDescription>
                    Allow the improvement agent to analyze feedback and propose changes
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value ?? false}
                    onCheckedChange={field.onChange}
                    disabled={disabled}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          {isEnabled && (
            <>
              <FormField
                control={control}
                name="improvementSettings.triggerType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trigger Type</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={disabled}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select trigger type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="scheduled">Scheduled (Cron)</SelectItem>
                        <SelectItem value="feedback_threshold">Feedback Threshold</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>How the improvement agent should be triggered</FormDescription>
                  </FormItem>
                )}
              />

              {improvementSettings?.triggerType === 'scheduled' && (
                <GenericInput
                  control={control}
                  name="improvementSettings.scheduleCron"
                  label="Cron Schedule"
                  placeholder="0 0 * * 1"
                  description="Cron expression for scheduled runs (e.g., weekly on Mondays)"
                  disabled={disabled}
                />
              )}

              {improvementSettings?.triggerType === 'feedback_threshold' && (
                <GenericInput
                  control={control}
                  name="improvementSettings.feedbackThreshold"
                  label="Feedback Threshold"
                  type="number"
                  placeholder="10"
                  min="1"
                  description="Number of feedback items to collect before triggering an improvement run"
                  disabled={disabled}
                />
              )}
            </>
          )}

          <InfoCard title="How improvements work:" Icon={Info}>
            <ul className="space-y-1.5 list-disc list-outside pl-4">
              <li>The improvement agent collects and analyzes user feedback</li>
              <li>It creates a new branch with proposed configuration changes</li>
              <li>Existing evaluations are run to detect regressions</li>
              <li>
                You review the changes in the <span className="font-medium">Improvements</span> tab
                and decide whether to merge
              </li>
            </ul>
          </InfoCard>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
