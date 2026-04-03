'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { DuplicateAgentRequest, ImportAgentWarning } from '@inkeep/agents-core';
import { DuplicateAgentRequestSchema } from '@inkeep/agents-core/client-exports';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FieldLabel } from '@/components/agent/sidepane/form-components/label';
import { GenericInput } from '@/components/form/generic-input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Form } from '@/components/ui/form';
import { useAutoPrefillId } from '@/hooks/use-auto-prefill-id';
import { duplicateAgentAction, importAgentAction } from '@/lib/actions/agent-full';
import { useAgentsListQuery } from '@/lib/query/agents';
import { useProjectsQuery } from '@/lib/query/projects';
import { isRequired } from '@/lib/utils';

const DuplicateAgentFormSchema = z.strictObject({
  ...DuplicateAgentRequestSchema.shape,
  newAgentName: z.preprocess(
    (value) => value || undefined,
    DuplicateAgentRequestSchema.shape.newAgentName
  ),
});

const initialData: DuplicateAgentRequest = {
  newAgentId: '',
  newAgentName: '',
};

interface DuplicateAgentSectionProps {
  tenantId: string;
  projectId: string;
  isOpen: boolean;
  onSuccess?: () => void;
}

function buildWarningSummary(warnings: ImportAgentWarning[]) {
  const disconnectedTools = warnings
    .filter((warning) => warning.resourceType === 'tool')
    .map((warning) => warning.resourceId);
  const disconnectedExternalAgents = warnings
    .filter((warning) => warning.resourceType === 'externalAgent')
    .map((warning) => warning.resourceId);

  const parts = [];

  if (disconnectedTools.length) {
    parts.push(`tools: ${disconnectedTools.join(', ')}`);
  }

  if (disconnectedExternalAgents.length) {
    parts.push(`external agents: ${disconnectedExternalAgents.join(', ')}`);
  }

  return parts.join(' | ');
}

function renderLabel(name: string, description?: string | null) {
  return (
    <div className="min-w-0">
      <div className="truncate font-medium">{name}</div>
      {description && <div className="truncate text-xs text-muted-foreground">{description}</div>}
    </div>
  );
}

export function DuplicateAgentSection({
  tenantId,
  projectId,
  isOpen,
  onSuccess,
}: DuplicateAgentSectionProps) {
  const router = useRouter();
  const [sourceProjectId, setSourceProjectId] = useState(projectId);
  const [sourceAgentId, setSourceAgentId] = useState('');
  const form = useForm({
    resolver: zodResolver(DuplicateAgentFormSchema),
    defaultValues: initialData,
    mode: 'onChange',
  });

  const { isSubmitting } = form.formState;
  const { data: projects, isError: projectsError } = useProjectsQuery({
    tenantId,
    enabled: isOpen,
  });
  const { data: agents } = useAgentsListQuery({
    tenantId,
    projectId: sourceProjectId,
    enabled: isOpen && Boolean(sourceProjectId),
  });

  const currentProject = projects.find((project) => project.projectId === projectId);
  const selectedAgent = agents.find((agent) => agent.id === sourceAgentId);
  const isImportingFromAnotherProject = sourceProjectId !== projectId;
  const currentProjectName = currentProject?.name ?? 'This project';
  const currentProjectDescription = currentProject?.description;
  const otherProjects = projects.filter((project) => project.projectId !== projectId);
  const projectOptions = [
    {
      value: projectId,
      selectedLabel: currentProjectName,
      label: renderLabel(currentProjectName, currentProjectDescription),
      searchBy: `${currentProjectName} ${currentProjectDescription} ${projectId}`,
    },
    ...otherProjects.map((project) => ({
      value: project.projectId,
      selectedLabel: project.name,
      label: renderLabel(project.name, project.description),
      searchBy: `${project.name} ${project.description ?? ''} ${project.projectId}`,
    })),
  ];

  useAutoPrefillId({
    form,
    nameField: 'newAgentName',
    idField: 'newAgentId',
  });

  useEffect(() => {
    if (!isOpen) {
      setSourceProjectId(projectId);
      setSourceAgentId('');
      form.reset(initialData);
    }
  }, [form, isOpen, projectId]);

  function handleProjectSelect(nextSourceProjectId: string) {
    setSourceProjectId(nextSourceProjectId);
    setSourceAgentId('');
    form.reset(initialData);
  }

  function handleSourceAgentSelect(agentId: string) {
    const sourceAgent = agents.find((agent) => agent.id === agentId);

    setSourceAgentId(agentId);
    form.reset({
      newAgentId: '',
      newAgentName: sourceAgent ? `${sourceAgent.name} (Copy)` : '',
    });
  }

  const onSubmit = form.handleSubmit(async (data) => {
    if (!sourceProjectId || !sourceAgentId) {
      return;
    }

    try {
      if (isImportingFromAnotherProject) {
        const result = await importAgentAction(tenantId, projectId, {
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

        onSuccess?.();
        router.push(`/${tenantId}/projects/${projectId}/agents/${result.data.data.id}`);
        return;
      }

      const result = await duplicateAgentAction(tenantId, projectId, sourceAgentId, data);

      if (!result.success) {
        toast.error(result.error || 'Failed to copy agent.');
        return;
      }

      toast.success('Agent copied!');
      onSuccess?.();
      router.push(`/${tenantId}/projects/${projectId}/agents/${result.data.id}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to copy agent.';
      toast.error(errorMessage);
    }
  });

  return (
    <Form {...form}>
      <form className="space-y-8" onSubmit={onSubmit}>
        <div className="space-y-2">
          <FieldLabel label="Source project" />
          <Combobox
            options={projectOptions}
            onSelect={handleProjectSelect}
            defaultValue={sourceProjectId}
            placeholder="Select a project"
            searchPlaceholder="Search projects..."
            notFoundMessage="No projects found."
            triggerClassName="w-full"
            className="w-(--radix-popover-trigger-width)"
          />
          {projectsError && (
            <p className="text-sm text-muted-foreground">
              Could not load other projects. You can still copy from this project.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <FieldLabel label="Source agent" />
          <Combobox
            options={agents.map((agent) => ({
              value: agent.id,
              selectedLabel: agent.name,
              label: renderLabel(agent.name, agent.description),
              searchBy: `${agent.name} ${agent.description ?? ''}`,
            }))}
            onSelect={handleSourceAgentSelect}
            defaultValue={sourceAgentId}
            placeholder={
              isImportingFromAnotherProject ? 'Select an agent to copy' : 'Select an existing agent'
            }
            searchPlaceholder="Search agents..."
            notFoundMessage="No agents found."
            triggerClassName="w-full"
            className="w-(--radix-popover-trigger-width)"
          />
        </div>

        {selectedAgent && isImportingFromAnotherProject && (
          <Alert variant="warning">
            <AlertTriangle />
            <AlertTitle>Credentials are not copied</AlertTitle>
            <AlertDescription>
              Tools and external agents that depend on missing credentials will import disconnected
              and need reconnecting in this project.
            </AlertDescription>
          </Alert>
        )}

        <GenericInput
          control={form.control}
          name="newAgentName"
          label="New name"
          placeholder={selectedAgent ? `${selectedAgent.name} (Copy)` : 'Copied agent'}
          description="Leave blank to use the default copied name."
          isRequired={isRequired(DuplicateAgentFormSchema, 'newAgentName')}
        />
        <GenericInput
          control={form.control}
          name="newAgentId"
          label="New id"
          placeholder={selectedAgent ? `${selectedAgent.id}-copy` : 'copied-agent'}
          description="This becomes the new agent URL and identifier."
          isRequired={isRequired(DuplicateAgentFormSchema, 'newAgentId')}
        />

        <div className="flex justify-end">
          <Button disabled={!sourceProjectId || !sourceAgentId || isSubmitting} type="submit">
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Copying...
              </>
            ) : (
              'Copy agent'
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
