'use client';

import { AlertCircle, Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { useAgentsListQuery } from '@/lib/query/agents';
import { useProjectsQuery } from '@/lib/query/projects';

interface ImportAgentSectionProps {
  tenantId: string;
  isOpen: boolean;
  onImportStub?: (selection: { sourceProjectId: string; sourceAgentId: string }) => void;
}

export function ImportAgentSection({ tenantId, isOpen, onImportStub }: ImportAgentSectionProps) {
  'use memo';
  const [sourceProjectId, setSourceProjectId] = useState('');
  const [sourceAgentId, setSourceAgentId] = useState('');

  const {
    data: projects,
    isError: projectsError,
    isFetching: projectsLoading,
  } = useProjectsQuery({ tenantId, enabled: isOpen });
  const {
    data: sourceAgents,
    isError: sourceAgentsError,
    isFetching: sourceAgentsLoading,
  } = useAgentsListQuery({
    tenantId,
    projectId: sourceProjectId,
    enabled: isOpen && Boolean(sourceProjectId),
  });

  const selectedProject = projects.find((project) => project.projectId === sourceProjectId);
  const selectedAgent = sourceAgents.find((agent) => agent.id === sourceAgentId);

  useEffect(() => {
    if (!isOpen) {
      setSourceProjectId('');
      setSourceAgentId('');
    }
  }, [isOpen]);

  function handleProjectSelect(projectId: string) {
    setSourceProjectId(projectId);
    setSourceAgentId('');
  }

  function handleImportClick() {
    if (!sourceProjectId || !sourceAgentId) {
      return;
    }

    if (onImportStub) {
      onImportStub({ sourceProjectId, sourceAgentId });
      return;
    }

    toast.info('Import from project is coming soon.');
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <div className="text-sm font-medium">Source project</div>
          <Combobox
            options={projects.map((project) => ({
              value: project.projectId,
              label: (
                <div className="min-w-0">
                  <div className="truncate font-medium">{project.name}</div>
                  {project.description && (
                    <div className="truncate text-xs text-muted-foreground">
                      {project.description}
                    </div>
                  )}
                </div>
              ),
              searchBy: `${project.name} ${project.description ?? ''}`,
            }))}
            onSelect={handleProjectSelect}
            defaultValue={sourceProjectId}
            placeholder="Select a source project"
            searchPlaceholder="Search projects..."
            notFoundMessage="No projects found."
            triggerClassName="w-full"
            className="w-(--radix-popover-trigger-width)"
            disabled={projectsLoading || availableProjects.length === 0}
          />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Source agent</div>
          <Combobox
            options={sourceAgents.map((agent) => ({
              value: agent.id,
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
              searchBy: `${agent.name} ${agent.description ?? ''} ${agent.id}`,
            }))}
            onSelect={setSourceAgentId}
            defaultValue={sourceAgentId}
            placeholder={
              sourceProjectId ? 'Select a source agent' : 'Select a source project first'
            }
            searchPlaceholder="Search agents..."
            notFoundMessage="No agents found."
            triggerClassName="w-full"
            className="w-(--radix-popover-trigger-width)"
            disabled={!sourceProjectId || sourceAgentsLoading || sourceAgents.length === 0}
          />
        </div>
      </div>

      {projectsLoading && (
        <Alert>
          <Info />
          <AlertTitle>Loading projects</AlertTitle>
          <AlertDescription>Fetching accessible projects for this workspace.</AlertDescription>
        </Alert>
      )}

      {projectsError ? (
        <Alert variant="warning">
          <AlertCircle />
          <AlertTitle>Could not load projects</AlertTitle>
          <AlertDescription>
            Try reopening the dialog and selecting a source project again.
          </AlertDescription>
        </Alert>
      ) : null}

      {!projectsLoading && !projectsError && availableProjects.length === 0 ? (
        <Alert>
          <Info />
          <AlertTitle>No other projects available</AlertTitle>
          <AlertDescription>
            Import currently supports another project in the same workspace. Create or access an
            additional project to use this flow.
          </AlertDescription>
        </Alert>
      ) : null}

      {sourceProjectId && sourceAgentsLoading && (
        <Alert>
          <Info />
          <AlertTitle>Loading agents</AlertTitle>
          <AlertDescription>Fetching agents from the selected source project.</AlertDescription>
        </Alert>
      )}

      {sourceProjectId && sourceAgentsError && (
        <Alert variant="warning">
          <AlertCircle />
          <AlertTitle>Could not load agents</AlertTitle>
          <AlertDescription>Try selecting the source project again.</AlertDescription>
        </Alert>
      )}

      {sourceProjectId &&
        !sourceAgentsLoading &&
        !sourceAgentsError &&
        sourceAgents.length === 0 && (
          <Alert>
            <Info />
            <AlertTitle>No agents found</AlertTitle>
            <AlertDescription>
              {selectedProject?.name ?? 'This project'} does not have any agents to import yet.
            </AlertDescription>
          </Alert>
        )}

      {selectedProject && selectedAgent && (
        <div className="rounded-lg border bg-muted/20 p-4">
          <div className="text-sm font-medium">Selected source</div>
          <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
            <div className="space-y-1">
              <dt className="text-muted-foreground">Project</dt>
              <dd className="font-medium">{selectedProject.name}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-muted-foreground">Agent</dt>
              <dd className="font-medium">{selectedAgent.name}</dd>
            </div>
            <div className="space-y-1 md:col-span-2">
              <dt className="text-muted-foreground">Description</dt>
              <dd>{selectedAgent.description || 'No description provided.'}</dd>
            </div>
          </dl>
        </div>
      )}

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline-primary"
          disabled={!sourceProjectId || !sourceAgentId}
          onClick={handleImportClick}
        >
          Import agent
        </Button>
      </div>
    </div>
  );
}
