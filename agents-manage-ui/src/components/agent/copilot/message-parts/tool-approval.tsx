import type { DataOperationEvent } from '@inkeep/agents-core';
import { CheckIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fetchToolApprovalDiff } from '@/lib/actions/tool-approval';
import { DiffField } from '../components/diff-viewer';
import { LoadingIndicator } from './loading';

interface ToolCallData {
  toolName: string;
  input: Record<string, any>;
  toolCallId: string;
  needsApproval: true;
  conversationId: string;
}

export type ToolCallApprovalData = DataOperationEvent & {
  type: 'tool_call';
  details: DataOperationEvent['details'] & {
    data: ToolCallData;
  };
};

interface FieldDiff {
  field: string;
  oldValue: any;
  newValue: any;
}

interface EntityData {
  id: string;
  name?: string;
  description?: string;
  [key: string]: any;
}

interface ToolApprovalProps {
  data: ToolCallApprovalData;
  copilotAgentId?: string;
  copilotProjectId?: string;
  copilotTenantId?: string;
  runApiUrl?: string;
}

export const FallbackApproval = ({ toolName }: { toolName: string }) => {
  return (
    <div className="text-sm text-muted-foreground">
      Would you like to run <Badge variant="code">{toolName}</Badge>?
    </div>
  );
};

export const DeleteEntityApproval = ({
  entityData,
  toolName,
}: {
  entityData: EntityData;
  toolName: string;
}) => {
  const displayName = entityData.name || entityData.id;
  const entityType = toolName.split('-').pop() || 'entity';
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col gap-1 flex-1">
        <div className="text-sm font-medium">Delete {entityType}?</div>
        <div className="text-sm text-muted-foreground">
          Are you sure you want to delete <Badge variant="code">{displayName}</Badge>?
        </div>
      </div>
    </div>
  );
};

export const DiffApproval = ({ diffs }: { diffs: FieldDiff[] }) => {
  return (
    <div className="flex flex-col gap-5">
      {diffs.map(({ field, oldValue, newValue }) => (
        <DiffField key={field} field={field} originalValue={oldValue} newValue={newValue} />
      ))}
    </div>
  );
};

const ApprovalWrapper = ({ children }: { children: React.ReactNode }) => {
  return <div className="flex flex-col rounded-lg border px-4 py-3 gap-5 my-3">{children}</div>;
};

export const ToolApproval = ({
  data,
  copilotAgentId,
  copilotProjectId,
  copilotTenantId,
  runApiUrl,
}: ToolApprovalProps) => {
  const [diffs, setDiffs] = useState<FieldDiff[]>([]);
  const [entityData, setEntityData] = useState<EntityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const { conversationId, toolCallId, input, toolName } = data.details.data;
  const { projectId, tenantId } = input.request || input;
  const isDeleteOperation = toolName.includes('delete');

  const handleApproval = (approved: boolean) => {
    setSubmitted(true);
    fetch(`${runApiUrl}/api/tool-approvals`, {
      method: 'POST',
      headers: {
        ...(copilotTenantId && { 'x-inkeep-tenant-id': copilotTenantId }),
        ...(copilotProjectId && { 'x-inkeep-project-id': copilotProjectId }),
        ...(copilotAgentId && { 'x-inkeep-agent-id': copilotAgentId }),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId,
        toolCallId,
        approved,
      }),
    });
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: Only run once per unique toolCallId to prevent re-fetching on stream updates
  useEffect(() => {
    const fetchAndComputeDiff = async () => {
      try {
        setLoading(true);
        setError(null);

        const result = await fetchToolApprovalDiff({
          toolName,
          input,
          tenantId,
          projectId,
        });

        if (!result.success) {
          setError(result.error || 'Failed to load entity state');
          return;
        }

        if (isDeleteOperation && result.entityData) {
          setEntityData(result.entityData as EntityData);
        } else {
          setDiffs(result.data || []);
        }
      } catch (err) {
        console.error('Failed to compute diff:', err);
        setError(err instanceof Error ? err.message : 'Failed to load entity state');
      } finally {
        setLoading(false);
      }
    };

    fetchAndComputeDiff();
  }, [toolCallId]);

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground">
        <LoadingIndicator messages={['Fetching changes', 'Analyzing changes', 'Generating diff']} />
      </div>
    );
  }

  if (error) {
    return <div className="text-sm text-destructive">Error: {error}</div>;
  }

  const ApprovalButtons = ({
    approveLabel = 'Approve',
    approveVariant = 'default' as 'default' | 'destructive',
    rejectLabel = 'Reject',
    approveIcon = <CheckIcon className="size-3" />,
  }: {
    approveLabel?: string;
    approveVariant?: 'default' | 'destructive' | 'destructive-outline';
    rejectLabel?: string;
    approveIcon?: React.ReactNode;
  }) =>
    !submitted && (
      <div className="flex gap-2 justify-end">
        <Button
          variant={approveVariant}
          size="xs"
          type="button"
          onClick={() => handleApproval(true)}
        >
          {approveIcon}
          {approveLabel}
        </Button>
        <Button variant="outline" size="xs" type="button" onClick={() => handleApproval(false)}>
          {rejectLabel}
        </Button>
      </div>
    );

  if (isDeleteOperation && entityData) {
    return (
      <ApprovalWrapper>
        <DeleteEntityApproval entityData={entityData} toolName={toolName} />
        <ApprovalButtons
          approveLabel="Delete"
          approveVariant="destructive"
          rejectLabel="Cancel"
          approveIcon={<Trash2Icon className="size-3" />}
        />
      </ApprovalWrapper>
    );
  }

  if (diffs.length > 0) {
    return (
      <ApprovalWrapper>
        <DiffApproval diffs={diffs} />
        <ApprovalButtons />
      </ApprovalWrapper>
    );
  }

  return (
    <ApprovalWrapper>
      <FallbackApproval toolName={toolName} />
      <ApprovalButtons />
    </ApprovalWrapper>
  );
};
