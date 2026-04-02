'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ImportAgentRequest, ImportAgentWarning } from '@inkeep/agents-core';
import { ImportAgentRequestSchema } from '@inkeep/agents-core/client-exports';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FieldLabel } from '@/components/agent/sidepane/form-components/label';
import { GenericInput } from '@/components/form/generic-input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Form } from '@/components/ui/form';
import { useAutoPrefillId } from '@/hooks/use-auto-prefill-id';
import { importAgentAction } from '@/lib/actions/agent-full';
import { useAgentsListQuery } from '@/lib/query/agents';
import { useProjectsQuery } from '@/lib/query/projects';
import { isRequired } from '@/lib/utils';

const ImportAgentFormSchema = ImportAgentRequestSchema.extend({
  newAgentName: ImportAgentRequestSchema.shape.newAgentName.transform(
    (value) => value || undefined
  ),
});

const initialData: ImportAgentRequest = {
  sourceProjectId: '',
  sourceAgentId: '',
  newAgentId: '',
  newAgentName: '',
};

interface ImportAgentSectionProps {
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

export function ImportAgentSection({
  tenantId,
  projectId,
  isOpen,
  onSuccess,
}: ImportAgentSectionProps) {
  'use memo';
  const router = useRouter();
  const [sourceProjectId, setSourceProjectId] = useState('');
  const [sourceAgentId, setSourceAgentId] = useState('');
  const form = useForm({
    resolver: zodResolver(ImportAgentFormSchema),
    defaultValues: initialData,
    mode: 'onChange',
  });

  const { isSubmitting } = form.formState;
  const {
    data: projects,
    isFetching: projectsLoading,
    isError: projectsError,
  } = useProjectsQuery({
    tenantId,
    enabled: isOpen,
  });

  const availableProjects = useMemo(
    () => projects.filter((project) => project.projectId !== projectId),
    [projectId, projects]
  );

  const {
    data: sourceAgents,
    isFetching: sourceAgentsLoading,
    isError: sourceAgentsError,
  } = useAgentsListQuery({
    tenantId,
    projectId: sourceProjectId,
    enabled: isOpen && Boolean(sourceProjectId),
  });

  const selectedProject = availableProjects.find(
    (project) => project.projectId === sourceProjectId
  );
  const selectedAgent = sourceAgents.find((agent) => agent.id === sourceAgentId);

  useAutoPrefillId({
    form,
    nameField: 'newAgentName',
    idField: 'newAgentId',
  });

  useEffect(() => {
    if (!isOpen) {
      setSourceProjectId('');
      setSourceAgentId('');
      form.reset(initialData);
    }
  }, [form, isOpen]);

  function handleProjectSelect(nextSourceProjectId: string) {
    setSourceProjectId(nextSourceProjectId);
    setSourceAgentId('');
    form.reset({
      sourceProjectId: nextSourceProjectId,
      sourceAgentId: '',
      newAgentId: '',
      newAgentName: '',
    });
  }

  function handleSourceAgentSelect(agentId: string) {
    const sourceAgent = sourceAgents.find((agent) => agent.id === agentId);

    setSourceAgentId(agentId);
    form.reset({
      sourceProjectId,
      sourceAgentId: agentId,
      newAgentId: '',
      newAgentName: sourceAgent ? `${sourceAgent.name} (Copy)` : '',
    });
  }

  const onSubmit = form.handleSubmit(async (data) => {
    if (!sourceProjectId || !sourceAgentId) {
      return;
    }

    try {
      const result = await importAgentAction(tenantId, projectId, {
        ...data,
        sourceProjectId,
        sourceAgentId,
      });

      if (!result.success) {
        toast.error(result.error || 'Failed to import agent.');
        return;
      }

      toast.success('Agent imported!');

      if (result.data.warnings.length) {
        const warningSummary = buildWarningSummary(result.data.warnings);
        toast.warning(
          warningSummary
            ? `Imported with disconnected resources. Reconnect ${warningSummary}.`
            : 'Imported with disconnected resources. Review imported tools and external agents.'
        );
      }

      onSuccess?.();
      router.push(`/${tenantId}/projects/${projectId}/agents/${result.data.data.id}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to import agent.';
      toast.error(errorMessage);
    }
  });

  if (projectsError) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Could not load projects. Try again.
      </div>
    );
  }

  if (projectsLoading) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Loading projects...
      </div>
    );
  }

  if (!availableProjects.length) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Create another project before importing an agent.
      </div>
    );
  }

  return (
    <Form {...form}>
      <form className="space-y-8" onSubmit={onSubmit}>
        <div className="space-y-2">
          <FieldLabel label="Source project" />
          <Combobox
            options={availableProjects.map((project) => ({
              value: project.projectId,
              selectedLabel: project.name,
              label: (
                <div className="min-w-0">
                  <div className="truncate font-medium">{project.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {project.description || project.projectId}
                  </div>
                </div>
              ),
              searchBy: `${project.name} ${project.description ?? ''} ${project.projectId}`,
            }))}
            onSelect={handleProjectSelect}
            defaultValue={sourceProjectId}
            placeholder="Select another project"
            searchPlaceholder="Search projects..."
            notFoundMessage="No projects found."
            triggerClassName="w-full"
            className="w-(--radix-popover-trigger-width)"
          />
        </div>

        {sourceProjectId && (
          <div className="space-y-2">
            <FieldLabel label="Source agent" />
            {sourceAgentsError ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Could not load agents from the selected project. Try again.
              </div>
            ) : sourceAgentsLoading ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Loading agents...
              </div>
            ) : !sourceAgents.length ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No agents available in the selected project.
              </div>
            ) : (
              <Combobox
                options={sourceAgents.map((agent) => ({
                  value: agent.id,
                  selectedLabel: agent.name,
                  label: (
                    <div className="min-w-0">
                      <div className="truncate font-medium">{agent.name}</div>
                      {agent.description && (
                        <div className="truncate text-xs text-muted-foreground">
                          {agent.description}
                        </div>
                      )}
                    </div>
                  ),
                  searchBy: `${agent.name} ${agent.description ?? ''}`,
                }))}
                onSelect={handleSourceAgentSelect}
                defaultValue={sourceAgentId}
                placeholder="Select an agent to import"
                searchPlaceholder="Search agents..."
                notFoundMessage="No agents found."
                triggerClassName="w-full"
                className="w-(--radix-popover-trigger-width)"
              />
            )}
          </div>
        )}

        {selectedProject && (
          <div className="rounded-lg border bg-muted/20 p-4">
            <div className="text-sm font-medium">Source project</div>
            <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
              <div className="space-y-1">
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-medium">{selectedProject.name}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-muted-foreground">ID</dt>
                <dd className="font-medium">{selectedProject.projectId}</dd>
              </div>
              <div className="space-y-1 md:col-span-2">
                <dt className="text-muted-foreground">Description</dt>
                <dd>{selectedProject.description || 'No description provided.'}</dd>
              </div>
            </dl>
          </div>
        )}

        {selectedAgent && (
          <>
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="text-sm font-medium">Source agent</div>
              <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                <div className="space-y-1">
                  <dt className="text-muted-foreground">Name</dt>
                  <dd className="font-medium">{selectedAgent.name}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-muted-foreground">ID</dt>
                  <dd className="font-medium">{selectedAgent.id}</dd>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <dt className="text-muted-foreground">Description</dt>
                  <dd>{selectedAgent.description || 'No description provided.'}</dd>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <dt className="text-muted-foreground">What gets copied</dt>
                  <dd>
                    Referenced project resources are recreated if needed. Triggers are skipped.
                  </dd>
                </div>
              </dl>
            </div>

            <Alert variant="warning">
              <AlertTriangle />
              <AlertTitle>Credentials are not copied</AlertTitle>
              <AlertDescription>
                Tools and external agents that depend on missing credentials will import
                disconnected and need reconnecting in this project.
              </AlertDescription>
            </Alert>
          </>
        )}

        <GenericInput
          control={form.control}
          name="newAgentName"
          label="New name"
          placeholder={selectedAgent ? `${selectedAgent.name} (Copy)` : 'Imported agent'}
          description="Leave blank to use the default imported name."
        />
        <GenericInput
          control={form.control}
          name="newAgentId"
          label="New id"
          placeholder={selectedAgent ? `${selectedAgent.id}-copy` : 'imported-agent'}
          description="This becomes the new agent URL and identifier."
          isRequired={isRequired(ImportAgentFormSchema, 'newAgentId')}
        />

        <div className="flex justify-end">
          <Button disabled={!sourceProjectId || !sourceAgentId || isSubmitting} type="submit">
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Importing...
              </>
            ) : (
              'Import agent'
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
