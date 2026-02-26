import type { Node } from '@xyflow/react';
import { Trash2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import { useWatch } from 'react-hook-form';
import { GenericInput } from '@/components/form/generic-input';
import { GenericJsonEditor } from '@/components/form/generic-json-editor';
import { GenericTextarea } from '@/components/form/generic-textarea';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
import { Separator } from '@/components/ui/separator';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';
import { useProjectPermissions } from '@/contexts/project';
import { useAgentStore } from '@/features/agent/state/use-agent-store';
import { useDeleteNode } from '@/hooks/use-delete-node';
import type { Credential } from '@/lib/api/credentials';
import { externalAgentHeadersTemplate } from '@/lib/templates';
import type { SubAgentExternalAgentConfigLookup } from '@/lib/types/agent-full';
import { getCurrentHeadersForExternalAgentNode } from '@/lib/utils/external-agent-utils';
import type { ExternalAgentNodeData } from '../../configuration/node-types';

interface ExternalAgentNodeEditorProps {
  selectedNode: Node<ExternalAgentNodeData>;
  credentialLookup: Record<string, Credential>;
  subAgentExternalAgentConfigLookup: SubAgentExternalAgentConfigLookup;
}

export function ExternalAgentNodeEditor({
  selectedNode,
  subAgentExternalAgentConfigLookup,
}: ExternalAgentNodeEditorProps) {
  const { canEdit } = useProjectPermissions();
  const { deleteNode } = useDeleteNode(selectedNode.id);
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();
  const form = useFullAgentFormContext();
  const id = selectedNode.data.id;
  const externalAgent = useWatch({
    control: form.control,
    name: `externalAgents.${id}`,
  });

  const path = <K extends string>(k: K) => `externalAgents.${id}.${k}` as const;

  const edges = useAgentStore((state) => state.edges);

  const getCurrentHeaders = useCallback((): Record<string, string> => {
    return getCurrentHeadersForExternalAgentNode(
      selectedNode,
      subAgentExternalAgentConfigLookup,
      edges
    );
  }, [selectedNode, subAgentExternalAgentConfigLookup, edges]);

  // Sync input value when node changes (but not on every data change)
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally omit getCurrentHeaders to prevent reset loops
  useEffect(() => {
    const newHeaders = getCurrentHeaders();
    form.setValue(path('headers'), JSON.stringify(newHeaders, null, 2));
  }, [selectedNode.id]);

  if (!externalAgent) {
    return;
  }
  // useEffect(() => {
  //   form.setError(path('name'), {
  //     type: 'manual',
  //     message: 'This field is invalid',
  //   });
  // }, []);
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
