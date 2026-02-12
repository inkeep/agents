import type { DataOperationEvent } from '@inkeep/agents-core';
import { CheckIcon, type LucideIcon, SettingsIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Heading } from '@/components/agent/sidepane/heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { FieldDiff } from '@/lib/actions/tool-approval';
import { fetchToolApprovalDiff } from '@/lib/actions/tool-approval';
import { parseToolNameForDisplay } from '@/lib/utils/tool-name-display';
import { DiffField } from '../components/diff-viewer';
import { LoadingIndicator } from './loading';

interface ToolCallData {
  toolName: string;
  input: Record<string, any>;
  toolCallId: string;
  needsApproval: true;
  conversationId: string;
}

type ToolCallApprovalData = DataOperationEvent & {
  type: 'tool_call';
  details: DataOperationEvent['details'] & {
    data: ToolCallData;
  };
};

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
  apiUrl?: string;
  cookieHeader?: string;
  copilotToken?: string;
}

const FallbackApproval = ({ toolName }: { toolName: string }) => {
  return (
    <div className="text-sm text-muted-foreground">
      Would you like to run <Badge variant="code">{toolName}</Badge>?
    </div>
  );
};

const DeleteEntityApproval = ({ entityData }: { entityData: EntityData }) => {
  const displayName = entityData.name || entityData.id;
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col gap-1 flex-1">
        <div className="text-sm text-muted-foreground">
          Are you sure you want to delete <Badge variant="code">{displayName}</Badge>?
        </div>
      </div>
    </div>
  );
};

const DiffApproval = ({ diffs }: { diffs: FieldDiff[] }) => {
  return (
    <div className="flex flex-col gap-5">
      {diffs.map(({ field, oldValue, newValue, renderAsCode }) => (
        <DiffField
          key={field}
          field={field}
          originalValue={oldValue}
          newValue={newValue}
          renderAsCode={renderAsCode}
        />
      ))}
    </div>
  );
};

const ApprovalWrapper = ({
  children,
  entityType,
  operationType,
  icon: Icon = SettingsIcon,
}: {
  children: React.ReactNode;
  entityType?: string;
  operationType?: string;
  icon?: LucideIcon;
}) => {
  return (
    <div className="flex flex-col rounded-lg border px-4 py-3 gap-5 my-3 text-foreground">
      {entityType && (
        <div className="flex items-center gap-2 justify-between">
          <Heading heading={entityType} Icon={Icon} />
          {operationType && (
            <Badge variant={operationType === 'delete' ? 'error' : 'primary'} className="uppercase">
              {operationType}
            </Badge>
          )}
        </div>
      )}
      {children}
    </div>
  );
};

export const ToolApproval = ({
  data,
  copilotAgentId,
  copilotProjectId,
  copilotTenantId,
  apiUrl,
  cookieHeader,
  copilotToken,
}: ToolApprovalProps) => {
  const [diffs, setDiffs] = useState<FieldDiff[]>([]);
  const [entityData, setEntityData] = useState<EntityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const { conversationId, toolCallId, input, toolName } = data.details.data;
  const { displayName: entityType, operationType, icon } = parseToolNameForDisplay(toolName);
  const { projectId, tenantId } = input.request || input;
  const isDeleteOperation = toolName.includes('delete');

  const handleApproval = async (approved: boolean) => {
    setSubmitted(true);
    try {
      const response = await fetch(`${apiUrl}/run/api/tool-approvals`, {
        method: 'POST',
        headers: {
          ...(copilotTenantId && { 'x-inkeep-tenant-id': copilotTenantId }),
          ...(copilotProjectId && { 'x-inkeep-project-id': copilotProjectId }),
          ...(copilotAgentId && { 'x-inkeep-agent-id': copilotAgentId }),
          ...(cookieHeader ? { 'x-forwarded-cookie': cookieHeader } : {}),
          Authorization: `Bearer ${copilotToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId,
          toolCallId,
          approved,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to ${approved ? 'approve' : 'reject'} tool call`);
      }
    } catch (error) {
      setSubmitted(false);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      toast.error(errorMessage);
    }
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
        <Button variant="outline" size="xs" type="button" onClick={() => handleApproval(false)}>
          {rejectLabel}
        </Button>
        <Button
          variant={approveVariant}
          size="xs"
          type="button"
          onClick={() => handleApproval(true)}
        >
          {approveIcon}
          {approveLabel}
        </Button>
      </div>
    );

  if (isDeleteOperation && entityData) {
    return (
      <ApprovalWrapper entityType={entityType} operationType={operationType} icon={icon}>
        <DeleteEntityApproval entityData={entityData} />
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
      <ApprovalWrapper entityType={entityType} operationType={operationType} icon={icon}>
        <DiffApproval diffs={diffs} />
        <ApprovalButtons />
      </ApprovalWrapper>
    );
  }

  return (
    <ApprovalWrapper entityType={entityType} operationType={operationType} icon={icon}>
      <FallbackApproval toolName={toolName} />
      <ApprovalButtons />
    </ApprovalWrapper>
  );
};
