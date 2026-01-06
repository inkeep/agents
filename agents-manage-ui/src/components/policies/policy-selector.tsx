import { GripVertical, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Policy } from '@/lib/types/policies';
import { cn } from '@/lib/utils';

type PolicySelection = {
  id: string;
  index?: number;
};

interface PolicySelectorProps {
  policyLookup: Record<string, Policy>;
  selectedPolicies: PolicySelection[];
  onChange: (policies: PolicySelection[]) => void;
  error?: string;
}

export function reorderPolicies(
  policies: PolicySelection[],
  fromId: string,
  toId: string
): PolicySelection[] {
  if (fromId === toId) return policies;
  const current = [...policies];
  const fromIndex = current.findIndex((p) => p.id === fromId);
  const toIndex = current.findIndex((p) => p.id === toId);
  if (fromIndex === -1 || toIndex === -1) {
    return policies;
  }
  const [moved] = current.splice(fromIndex, 1);
  current.splice(toIndex, 0, moved);
  return current.map((policy, idx) => ({ ...policy, index: idx }));
}

export function PolicySelector({
  policyLookup,
  selectedPolicies,
  onChange,
  error,
}: PolicySelectorProps) {
  const [pendingAdd, setPendingAdd] = useState<string>('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const orderedPolicies = useMemo(
    () => [...selectedPolicies].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)),
    [selectedPolicies]
  );

  const availablePolicies = useMemo(
    () =>
      Object.values(policyLookup).filter(
        (policy) => !orderedPolicies.some((selected) => selected.id === policy.id)
      ),
    [policyLookup, orderedPolicies]
  );

  const handleAdd = () => {
    if (!pendingAdd || pendingAdd === '__none') return;
    const next = [...orderedPolicies, { id: pendingAdd, index: orderedPolicies.length }];
    onChange(next);
    setPendingAdd('');
  };

  const handleRemove = (id: string) => {
    const next = orderedPolicies.filter((policy) => policy.id !== id);
    onChange(next.map((policy, idx) => ({ ...policy, index: idx })));
  };

  const handleDrop = (targetId: string) => {
    if (!draggingId) return;
    const next = reorderPolicies(orderedPolicies, draggingId, targetId);
    onChange(next);
    setDraggingId(null);
    setDragOverId(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Policies</Label>
        <div className="flex items-center gap-2">
          <Select value={pendingAdd} onValueChange={setPendingAdd}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Select policy" />
            </SelectTrigger>
            <SelectContent>
              {availablePolicies.length ? (
                availablePolicies.map((policy) => (
                  <SelectItem key={policy.id} value={policy.id}>
                    {policy.name}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="__none" disabled>
                  No available policies
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleAdd}
            disabled={!pendingAdd}
          >
            <Plus className="size-4" />
            Add
          </Button>
        </div>
      </div>
      {orderedPolicies.length === 0 ? (
        <p className="text-sm text-muted-foreground">No policies attached.</p>
      ) : (
        <ul className="space-y-2">
          {orderedPolicies.map((policy) => {
            const details = policyLookup[policy.id];
            return (
              <li
                key={policy.id}
                className={cn(
                  'border rounded-md px-3 py-2 flex items-center justify-between gap-3 bg-background',
                  dragOverId === policy.id && 'border-primary'
                )}
                draggable
                onDragStart={() => setDraggingId(policy.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverId(policy.id);
                }}
                onDragLeave={() => setDragOverId(null)}
                onDrop={() => handleDrop(policy.id)}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDragOverId(null);
                }}
              >
                <div className="flex items-center gap-3">
                  <GripVertical className="size-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium">
                      {details?.name || policy.id}{' '}
                      <span className="text-xs text-muted-foreground">
                        (#{(policy.index ?? 0) + 1})
                      </span>
                    </div>
                    {details?.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {details.description}
                      </p>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => handleRemove(policy.id)}>
                  <X className="size-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
