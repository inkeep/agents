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
import { useDeleteNode } from '@/hooks/use-delete-node';
import { teamAgentHeadersTemplate } from '@/lib/templates';
import type { SubAgentTeamAgentConfigLookup } from '@/lib/types/agent-full';
import { getCurrentHeadersForTeamAgentNode } from '@/lib/utils/team-agent-utils';
import type { TeamAgentNodeData } from '../../configuration/node-types';

interface TeamAgentNodeEditorProps {
  selectedNode: Node<TeamAgentNodeData>;
  subAgentTeamAgentConfigLookup: SubAgentTeamAgentConfigLookup;
}

export function TeamAgentNodeEditor({
  selectedNode,
  subAgentTeamAgentConfigLookup,
}: TeamAgentNodeEditorProps) {
  const { canEdit } = useProjectPermissions();
  const { deleteNode } = useDeleteNode(selectedNode.id);
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();

  const getCurrentHeaders = useCallback((): Record<string, string> => {
    return getCurrentHeadersForTeamAgentNode(selectedNode, subAgentTeamAgentConfigLookup, []);
  }, [selectedNode, subAgentTeamAgentConfigLookup]);

  // Sync input value when node changes (but not on every data change)
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally omit getCurrentHeaders to prevent reset loops
  useEffect(() => {
    const newHeaders = getCurrentHeaders();
    form.setValue(path('headers'), JSON.stringify(newHeaders, null, 2));
  }, [selectedNode.id]);

  const form = useFullAgentFormContext();
  const id = selectedNode.data.id;
  const teamAgent = useWatch({ control: form.control, name: `teamAgents.${id}` });

  const path = <K extends string>(key: K) => `teamAgents.${id}.${key}` as const;
  console.log(teamAgent);
  if (!teamAgent) {
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
        Team agents are other agents within the same project that can collaborate and delegate tasks
        using the A2A (Agent-to-Agent) protocol. Team agents enable you to create specialized agents
        that work together to accomplish complex tasks.
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
      <GenericJsonEditor
        control={form.control}
        name={path('headers')}
        label="Headers"
        placeholder="{}"
        customTemplate={teamAgentHeadersTemplate}
      />
      <ExternalLink href={`/${tenantId}/projects/${projectId}/agents/${selectedNode.data.id}`}>
        View Agent
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
