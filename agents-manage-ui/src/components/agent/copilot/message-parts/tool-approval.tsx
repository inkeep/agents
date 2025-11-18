import type { DataOperationEvent } from '@inkeep/agents-core';
import { CheckIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
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

interface ToolApprovalProps {
  data: ToolCallApprovalData;
  copilotAgentId?: string;
  copilotProjectId?: string;
  copilotTenantId?: string;
  runApiUrl?: string;
}

export const ToolApproval = ({
  data,
  copilotAgentId,
  copilotProjectId,
  copilotTenantId,
  runApiUrl,
}: ToolApprovalProps) => {
  const [diffs, setDiffs] = useState<FieldDiff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const { conversationId, toolCallId, input, toolName } = data.details.data;
  const { projectId, tenantId } = input.request || input;

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

        setDiffs(result.data || []);
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

  return (
    <div className="flex flex-col rounded-lg border px-4 py-3 gap-5">
      <div className="flex flex-col gap-5">
        {diffs.map(({ field, oldValue, newValue }) => (
          <DiffField key={field} field={field} originalValue={oldValue} newValue={newValue} />
        ))}
      </div>
      {!submitted && (
        <div className="flex gap-2 justify-end">
          <Button variant="default" size="xs" type="button" onClick={() => handleApproval(true)}>
            <CheckIcon className="w-4 h-4" />
            Approve
          </Button>
          <Button variant="outline" size="xs" type="button" onClick={() => handleApproval(false)}>
            Reject
          </Button>
        </div>
      )}
    </div>
  );
};
