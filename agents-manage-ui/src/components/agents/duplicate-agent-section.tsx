'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ImportAgentWarning } from '@inkeep/agents-core';
import { DuplicateAgentRequestSchema } from '@inkeep/agents-core/client-exports';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type Dispatch, type SetStateAction, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FieldLabel } from '@/components/agent/sidepane/form-components/label';
import { GenericInput } from '@/components/form/generic-input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { useAutoPrefillId } from '@/hooks/use-auto-prefill-id';
import { duplicateAgentAction, importAgentAction } from '@/lib/actions/agent-full';
import { useProjectsQuery } from '@/lib/query/projects';
import { isRequired } from '@/lib/utils';

const DuplicateAgentFormSchema = z.strictObject({
  ...DuplicateAgentRequestSchema.shape,
  newAgentName: z.preprocess(
    (value) => value || undefined,
    DuplicateAgentRequestSchema.shape.newAgentName
  ),
});

interface DuplicateAgentDialogProps {
  tenantId: string;
  sourceProjectId: string;
  sourceAgentId: string;
  sourceAgentName: string;
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
}

function buildWarningSummary(warnings: ImportAgentWarning[]) {
  const disconnectedTools = warnings
    .filter((warning) => warning.resourceType === 'tool')
    .map((warning) => warning.resourceId)
    .join(', ');
  const disconnectedExternalAgents = warnings
    .filter((warning) => warning.resourceType === 'externalAgent')
    .map((warning) => warning.resourceId)
    .join(', ');

  const parts = [];

  if (disconnectedTools) {
    parts.push(`tools: ${disconnectedTools}`);
  }

  if (disconnectedExternalAgents) {
    parts.push(`external agents: ${disconnectedExternalAgents}`);
  }

  return parts.join(' | ');
}

function renderProjectLabel(name: string, description?: string | null) {
  return (
    <div className="min-w-0">
      <div className="truncate font-medium">{name}</div>
      {description && <div className="truncate text-xs text-muted-foreground">{description}</div>}
    </div>
  );
}

export function DuplicateAgentDialog({
  tenantId,
  sourceProjectId,
  sourceAgentId,
  sourceAgentName,
  isOpen,
  setIsOpen,
}: DuplicateAgentDialogProps) {
  const router = useRouter();
  const [isTargetProjectPickerVisible, setIsTargetProjectPickerVisible] = useState(false);
  const [targetProjectId, setTargetProjectId] = useState(sourceProjectId);
  const form = useForm({
    resolver: zodResolver(DuplicateAgentFormSchema),
    defaultValues: {
      newAgentId: '',
      newAgentName: `${sourceAgentName} (Copy)`,
    },
    mode: 'onChange',
  });

  const { isSubmitting } = form.formState;
  const { data: projects, isError: projectsError } = useProjectsQuery({
    tenantId,
    enabled: isOpen,
  });

  const currentProject = projects.find((project) => project.projectId === sourceProjectId);
  const currentProjectName = currentProject?.name ?? 'Current project';
  const currentProjectDescription = currentProject?.description;
  const otherProjects = projects.filter((project) => project.projectId !== sourceProjectId);
  const projectOptions = [
    {
      value: sourceProjectId,
      selectedLabel: currentProjectName,
      label: renderProjectLabel(currentProjectName, currentProjectDescription),
      searchBy: `${currentProjectName} ${currentProjectDescription ?? ''} ${sourceProjectId}`,
    },
    ...otherProjects.map((project) => ({
      value: project.projectId,
      selectedLabel: project.name,
      label: renderProjectLabel(project.name, project.description),
      searchBy: `${project.name} ${project.description ?? ''} ${project.projectId}`,
    })),
  ];

  const isImportingToAnotherProject = targetProjectId !== sourceProjectId;
  const targetProject = projects.find((project) => project.projectId === targetProjectId);
  const targetProjectName = targetProject?.name ?? currentProjectName;

  useAutoPrefillId({
    form,
    nameField: 'newAgentName',
    idField: 'newAgentId',
  });

  function handleOpenChange(open: boolean) {
    if (!open) {
      setIsTargetProjectPickerVisible(false);
      setTargetProjectId(sourceProjectId);
      form.reset({
        newAgentId: '',
        newAgentName: `${sourceAgentName} (Copy)`,
      });
    }

    setIsOpen(open);
  }

  function handleTargetProjectSelect(projectId: string) {
    setTargetProjectId(projectId);
    setIsTargetProjectPickerVisible(false);
  }

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      if (isImportingToAnotherProject) {
        const result = await importAgentAction(tenantId, targetProjectId, {
          ...data,
          sourceProjectId,
          sourceAgentId,
        });

        if (!result.success) {
          toast.error(result.error || 'Failed to copy agent.');
          return;
        }

        toast.success('Agent copied!');

        if (result.data.warnings.length) {
          const warningSummary = buildWarningSummary(result.data.warnings);
          toast.warning(
            warningSummary
              ? `Copied with disconnected resources. Reconnect ${warningSummary}.`
              : 'Copied with disconnected resources. Review imported tools and external agents.'
          );
        }

        handleOpenChange(false);
        router.push(`/${tenantId}/projects/${targetProjectId}/agents/${result.data.data.id}`);
        return;
      }

      const result = await duplicateAgentAction(tenantId, sourceProjectId, sourceAgentId, data);

      if (!result.success) {
        toast.error(result.error || 'Failed to copy agent.');
        return;
      }

      toast.success('Agent copied!');
      handleOpenChange(false);
      router.push(`/${tenantId}/projects/${sourceProjectId}/agents/${result.data.id}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to copy agent.';
      toast.error(errorMessage);
    }
  });

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{`Duplicate "${sourceAgentName}" agent`}</DialogTitle>
          <DialogDescription>
            Create a copy of this agent in the current project or another project.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form className="space-y-4" onSubmit={onSubmit}>
            {isImportingToAnotherProject && (
              <Alert variant="warning">
                <AlertTriangle />
                <AlertTitle>Credentials are not copied</AlertTitle>
                <AlertDescription>
                  Tools and external agents that depend on missing credentials will import
                  disconnected and need reconnecting in the target project.
                </AlertDescription>
              </Alert>
            )}

            <GenericInput
              control={form.control}
              name="newAgentName"
              label="New name"
              placeholder={`${sourceAgentName} (Copy)`}
              description="Leave blank to use the default copied name."
              isRequired={isRequired(DuplicateAgentFormSchema, 'newAgentName')}
            />
            <GenericInput
              control={form.control}
              name="newAgentId"
              label="New id"
              placeholder={`${sourceAgentId}-copy`}
              description="This becomes the new agent URL and identifier."
              isRequired={isRequired(DuplicateAgentFormSchema, 'newAgentId')}
            />
            <div className="space-y-2">
              {isTargetProjectPickerVisible ? (
                <>
                  <FieldLabel label="Target project" isRequired />
                  <Combobox
                    options={projectOptions}
                    onSelect={handleTargetProjectSelect}
                    defaultValue={targetProjectId}
                    placeholder="Select a project"
                    searchPlaceholder="Search projects..."
                    notFoundMessage="No projects found."
                    triggerClassName="w-full"
                    className="w-(--radix-popover-trigger-width)"
                  />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {`Your duplicated agent will be created in the ${isImportingToAnotherProject ? 'selected' : 'same'} project:`}{' '}
                  <b className="text-foreground">"{targetProjectName}"</b>{' '}
                  {!projectsError && (
                    <button
                      type="button"
                      className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                      onClick={() => setIsTargetProjectPickerVisible(true)}
                    >
                      Change
                    </button>
                  )}
                </p>
              )}
              {projectsError && (
                <p className="text-sm text-destructive">
                  Could not load other projects. You can still copy within this project.
                </p>
              )}
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button disabled={isSubmitting} type="submit">
                {isSubmitting ? (
                  <>
                    <Loader2 className="animate-spin" /> Copying...
                  </>
                ) : (
                  'Duplicate agent'
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
