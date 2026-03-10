import type { Node } from '@xyflow/react';
import { Trash2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { GenericInput } from '@/components/form/generic-input';
import { GenericJsonEditor } from '@/components/form/generic-json-editor';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
import { Separator } from '@/components/ui/separator';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';
import { useProjectPermissions } from '@/contexts/project';
import { useDeleteNode } from '@/hooks/use-delete-node';
import { externalAgentHeadersTemplate } from '@/lib/templates';
import type { ExternalAgentNodeData } from '../../configuration/node-types';

interface ExternalAgentNodeEditorProps {
  selectedNode: Node<ExternalAgentNodeData>;
}

export function ExternalAgentNodeEditor({ selectedNode }: ExternalAgentNodeEditorProps) {
  const { canEdit } = useProjectPermissions();
  const { deleteNode } = useDeleteNode(selectedNode.id);
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();
  const form = useFullAgentFormContext();
  const id = selectedNode.data.id;

  const path = <K extends string>(key: K) => `externalAgents.${id}.${key}` as const;

  // Sync input value when node changes (but not on every data change)
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally omit getCurrentHeaders to prevent reset loops
  useEffect(() => {
    const fieldPath = path('headers');
    const existingHeaders = form.getValues(fieldPath);
    if (existingHeaders !== undefined) {
      return;
    }
    const newHeaders = selectedNode.data.tempHeaders ?? {};
    form.setValue(fieldPath, JSON.stringify(newHeaders, null, 2));
  }, [selectedNode.id]);

  return (
    <div className="space-y-8 flex flex-col">
      <p className="text-sm text-muted-foreground">
        External agents are agents that live outside of your project that can communicate using the
        A2A (Agent-to-Agent) protocol. External agents enable you to delegate tasks between agents
        within the agent framework or to third-party services.
      </p>

      <GenericInput
        control={form.control}
        name={path('name')}
        label="Name"
        placeholder="Support agent"
        disabled
        isRequired
      />
      <GenericInput
        control={form.control}
        name={path('id')}
        label="Id"
        placeholder="my-external-agent"
        disabled
        description="Choose a unique identifier for this agent. Using an existing id will replace that agent."
        isRequired
      />
      <GenericTextarea
        control={form.control}
        name={path('description')}
        label="Description"
        placeholder="This agent is responsible for..."
        disabled
      />
      <GenericInput
        control={form.control}
        name={path('baseUrl')}
        label="Host URL"
        placeholder="https://api.example.com/agent"
        tooltip="This URL is used to discover the agent's capabilities and communicate with it using the A2A protocol. For locally hosted agent defined with the agent-framework this would be: http://localhost:3002/manage/tenants/:tenantId/projects/:projectId/agents/:agentId"
        disabled
        isRequired
      />
      <GenericJsonEditor
        control={form.control}
        name={path('headers')}
        label="Headers"
        placeholder="{}"
        customTemplate={externalAgentHeadersTemplate}
      />
      <ExternalLink
        href={`/${tenantId}/projects/${projectId}/external-agents/${selectedNode.data.id}/edit`}
      >
        View External Agent
      </ExternalLink>
      {canEdit && (
        <>
          <Separator />
          <div className="flex justify-end">
            <Button variant="destructive-outline" size="sm" onClick={deleteNode}>
              <Trash2 className="size-4" />
              Delete
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
