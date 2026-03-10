'use client';

import {
  BotIcon,
  CodeIcon,
  ComponentIcon,
  GlobeIcon,
  HammerIcon,
  type LucideIcon,
  SettingsIcon,
  WorkflowIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { DiffField } from '@/components/agent/copilot/components/diff-viewer';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { fetchBranchDiffDetailsAction } from '@/lib/actions/branches';
import type { BranchDiffChange, BranchDiffDetailItem } from '@/lib/api/branches';

const ENTITY_ICONS: Record<string, LucideIcon> = {
  Agent: WorkflowIcon,
  'Sub Agent': BotIcon,
  'Context Config': SettingsIcon,
  Tool: HammerIcon,
  'Function Tool': CodeIcon,
  Function: CodeIcon,
  'External Agent': GlobeIcon,
  'Data Component': ComponentIcon,
};

const DIFF_TYPE_BADGE: Record<string, { label: string; variant: 'success' | 'error' | 'warning' }> =
  {
    modified: { label: 'Modified', variant: 'warning' },
    added: { label: 'Added', variant: 'success' },
    removed: { label: 'Removed', variant: 'error' },
  };

function formatFieldName(field: string) {
  return field
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function EntityChangeCard({
  change,
  displayName,
}: {
  change: BranchDiffChange;
  displayName: string;
}) {
  const badge = DIFF_TYPE_BADGE[change.changeType] || DIFF_TYPE_BADGE.modified;
  const Icon = ENTITY_ICONS[displayName] || SettingsIcon;

  return (
    <div className="flex flex-col rounded-lg border px-4 py-3 gap-4 text-foreground">
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium truncate min-w-0">{change.entityName}</span>
        <Badge variant="code">{displayName}</Badge>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>
      {change.fields.length > 0 && (
        <div className="flex flex-col gap-4">
          {change.fields.map((f) => {
            const isNewField = !f.oldValue || f.oldValue.trim() === '';
            const isRemovedField = !f.newValue || f.newValue.trim() === '';
            const fieldLabel = isNewField
              ? `${formatFieldName(f.field)} (new)`
              : isRemovedField
                ? `${formatFieldName(f.field)} (cleared)`
                : formatFieldName(f.field);
            return (
              <DiffField
                key={f.field}
                field={fieldLabel}
                originalValue={f.oldValue ?? ''}
                newValue={f.newValue ?? ''}
                renderAsCode={f.renderAsCode}
                editorOptions={{
                  wordWrap: 'off',
                  scrollbar: { horizontal: 'auto', alwaysConsumeMouseWheel: false },
                }}
              />
            );
          })}
        </div>
      )}
      {change.changeType === 'added' && change.fields.length === 0 && (
        <div className="text-sm text-muted-foreground">New entity created</div>
      )}
      {change.changeType === 'removed' && change.fields.length === 0 && (
        <div className="text-sm text-muted-foreground">Entity deleted</div>
      )}
    </div>
  );
}

interface BranchDiffContentProps {
  tenantId: string;
  projectId: string;
  branchName: string;
}

export function BranchDiffContent({ tenantId, projectId, branchName }: BranchDiffContentProps) {
  const [data, setData] = useState<BranchDiffDetailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      const result = await fetchBranchDiffDetailsAction(tenantId, projectId, branchName);
      if (cancelled) return;
      if (result.success) {
        setData(result.data || []);
      } else {
        setError(result.error || 'Failed to load diff');
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [tenantId, projectId, branchName]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Loading changes...
      </div>
    );
  }

  if (error) {
    return <div className="py-4 text-sm text-destructive">Error: {error}</div>;
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No changes on this branch
      </div>
    );
  }

  const allChanges = data.flatMap((table) =>
    table.changes.map((change) => ({ ...change, displayName: table.displayName }))
  );

  return (
    <div className="flex flex-col gap-3">
      {allChanges.map((change) => (
        <EntityChangeCard
          key={`${change.displayName}-${change.entityId}`}
          change={change}
          displayName={change.displayName}
        />
      ))}
    </div>
  );
}

interface BranchDiffDialogProps {
  tenantId: string;
  projectId: string;
  branchName: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BranchDiffDialog({
  tenantId,
  projectId,
  branchName,
  isOpen,
  onOpenChange,
}: BranchDiffDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent size="3xl" className="max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Changes on <Badge variant="code">{branchName}</Badge>
          </DialogTitle>
          <DialogDescription>Review all changes before merging into main</DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1 -mx-6 px-6">
          {isOpen && (
            <BranchDiffContent tenantId={tenantId} projectId={projectId} branchName={branchName} />
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
