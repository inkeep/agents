import type { ToolUIPart } from 'ai';
import { CheckIcon, ChevronDown, type LucideIcon, SettingsIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Heading } from '@/components/agent/sidepane/heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { FieldDiff } from '@/lib/actions/tool-approval';
import { fetchToolApprovalDiff } from '@/lib/actions/tool-approval';
import { cn } from '@/lib/utils';
import { parseToolNameForDisplay } from '@/lib/utils/tool-name-display';
import { DiffField } from '../components/diff-viewer';
import { LoadingIndicator } from './loading';

const PEEK_COUNT = 3;

interface EntityData {
  id: string;
  name?: string;
  description?: string;
  [key: string]: any;
}

interface ToolApprovalProps {
  tool: ToolUIPart;
  approve: (approved?: boolean) => Promise<void>;
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

const DiffApproval = ({
  diffs,
  expanded,
  isCollapsible,
}: {
  diffs: FieldDiff[];
  expanded: boolean;
  isCollapsible: boolean;
}) => {
  const visibleDiffs = isCollapsible && !expanded ? diffs.slice(0, PEEK_COUNT) : diffs;

  return (
    <div className="relative">
      <div className="flex flex-col gap-5">
        {visibleDiffs.map(({ field, oldValue, newValue, renderAsCode }) => (
          <DiffField
            key={field}
            field={field}
            originalValue={oldValue}
            newValue={newValue}
            renderAsCode={renderAsCode}
          />
        ))}
      </div>
      {isCollapsible && !expanded && (
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background to-transparent pointer-events-none" />
      )}
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

const ApprovalButtons = ({
  state,
  approve,
  approveLabel = 'Approve',
  approveVariant = 'default' as 'default' | 'destructive',
  rejectLabel = 'Reject',
  approveIcon = <CheckIcon className="size-3" />,
}: {
  state: string;
  approve: (approved?: boolean) => Promise<void>;
  approveLabel?: string;
  approveVariant?: 'default' | 'destructive' | 'destructive-outline';
  rejectLabel?: string;
  approveIcon?: React.ReactNode;
}) =>
  state === 'approval-requested' && (
    <div className="flex gap-2">
      <Button variant="outline" size="xs" type="button" onClick={() => approve(false)}>
        {rejectLabel}
      </Button>
      <Button variant={approveVariant} size="xs" type="button" onClick={() => approve(true)}>
        {approveIcon}
        {approveLabel}
      </Button>
    </div>
  );

export const ToolApproval = ({ tool, approve }: ToolApprovalProps) => {
  const [diffs, setDiffs] = useState<FieldDiff[]>([]);
  const [entityData, setEntityData] = useState<EntityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const { toolCallId, input, type } = tool;

  const toolName = type.replace(/^tool-/, '');
  const { displayName: entityType, operationType, icon } = parseToolNameForDisplay(toolName);
  const { projectId, tenantId } = (input as Record<string, any>).request || input;
  const isDeleteOperation = toolName.includes('delete');

  // biome-ignore lint/correctness/useExhaustiveDependencies: Only run once per unique toolCallId to prevent re-fetching on stream updates
  useEffect(() => {
    const fetchAndComputeDiff = async () => {
      try {
        setLoading(true);
        setError(null);

        const result = await fetchToolApprovalDiff({
          toolName,
          input: input as Record<string, any>,
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

  if (isDeleteOperation && entityData) {
    return (
      <ApprovalWrapper entityType={entityType} operationType={operationType} icon={icon}>
        <DeleteEntityApproval entityData={entityData} />
        <div className="flex items-center justify-end">
          <ApprovalButtons
            state={tool.state}
            approve={approve}
            approveLabel="Delete"
            approveVariant="destructive"
            rejectLabel="Cancel"
            approveIcon={<Trash2Icon className="size-3" />}
          />
        </div>
      </ApprovalWrapper>
    );
  }

  if (diffs.length > 0) {
    const isCollapsible = diffs.length > PEEK_COUNT;
    const hiddenCount = Math.max(0, diffs.length - PEEK_COUNT);

    return (
      <ApprovalWrapper entityType={entityType} operationType={operationType} icon={icon}>
        <DiffApproval diffs={diffs} expanded={expanded} isCollapsible={isCollapsible} />
        <div className={cn('flex items-center', isCollapsible ? 'justify-between' : 'justify-end')}>
          {isCollapsible && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              aria-expanded={expanded}
              onClick={() => setExpanded((prev) => !prev)}
            >
              <ChevronDown
                className={cn('size-3 transition-transform duration-200', expanded && 'rotate-180')}
              />
              {expanded ? 'Show less' : `Show ${hiddenCount} more`}
            </Button>
          )}
          <ApprovalButtons state={tool.state} approve={approve} />
        </div>
      </ApprovalWrapper>
    );
  }

  return (
    <ApprovalWrapper entityType={entityType} operationType={operationType} icon={icon}>
      <FallbackApproval toolName={toolName} />
      <div className="flex items-center justify-end">
        <ApprovalButtons state={tool.state} approve={approve} />
      </div>
    </ApprovalWrapper>
  );
};
