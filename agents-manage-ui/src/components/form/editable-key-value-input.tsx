'use client';

import { Plus, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { useFormContext } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface KeyValuePair {
  id: string;
  key: string;
  value: string;
}

interface EditableKeyValueInputProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  description?: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addButtonLabel?: string;
  isRequired?: boolean;
}

let idCounter = 0;
function generateId(): string {
  return `kv-${++idCounter}`;
}

function recordToArray(record: Record<string, string> | undefined): KeyValuePair[] {
  if (!record || typeof record !== 'object') {
    return [];
  }
  return Object.entries(record).map(([key, value]) => ({
    id: generateId(),
    key,
    value,
  }));
}

function arrayToRecord(pairs: KeyValuePair[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of pairs) {
    const trimmedKey = pair.key.trim();
    if (trimmedKey) {
      result[trimmedKey] = pair.value;
    }
  }
  return result;
}

export function EditableKeyValueInput<T extends FieldValues>({
  control,
  name,
  label,
  description,
  keyPlaceholder = 'key',
  valuePlaceholder = 'value',
  addButtonLabel = 'Add header',
  isRequired,
}: EditableKeyValueInputProps<T>) {
  const form = useFormContext();

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel isRequired={isRequired}>{label}</FormLabel>
          <FormControl>
            <EditableKeyValueInputInner
              value={field.value}
              onChange={field.onChange}
              keyPlaceholder={keyPlaceholder}
              valuePlaceholder={valuePlaceholder}
              addButtonLabel={addButtonLabel}
              setError={(message) => form.setError(name, { type: 'manual', message })}
              clearErrors={() => form.clearErrors(name)}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

interface EditableKeyValueInputInnerProps {
  value: Record<string, string> | undefined;
  onChange: (value: Record<string, string>) => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
  addButtonLabel: string;
  setError: (message: string) => void;
  clearErrors: () => void;
}

function EditableKeyValueInputInner({
  value,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
  addButtonLabel,
  setError,
  clearErrors,
}: EditableKeyValueInputInnerProps) {
  const [pairs, setPairs] = useState<KeyValuePair[]>(() => {
    const initial = recordToArray(value);
    return initial.length > 0 ? initial : [{ id: generateId(), key: '', value: '' }];
  });

  const duplicateKeys = useMemo(() => {
    const keyCount = new Map<string, number>();
    for (const pair of pairs) {
      const trimmedKey = pair.key.trim();
      if (trimmedKey) {
        keyCount.set(trimmedKey, (keyCount.get(trimmedKey) || 0) + 1);
      }
    }
    const duplicates = new Set<string>();
    for (const [key, count] of keyCount) {
      if (count > 1) {
        duplicates.add(key);
      }
    }
    return duplicates;
  }, [pairs]);

  // Sync pairs to form when they change (after render, not during)
  useEffect(() => {
    if (duplicateKeys.size === 0) {
      onChange(arrayToRecord(pairs));
    }
  }, [pairs, duplicateKeys, onChange]);

  // Handle duplicate key errors
  useEffect(() => {
    if (duplicateKeys.size > 0) {
      const list = Array.from(duplicateKeys).join(', ');
      setError(`Keys must be unique. Duplicate keys: ${list}`);
    } else {
      clearErrors();
    }
  }, [duplicateKeys, setError, clearErrors]);

  const updatePair = useCallback((id: string, field: 'key' | 'value', newValue: string) => {
    setPairs((current) =>
      current.map((pair) => (pair.id === id ? { ...pair, [field]: newValue } : pair))
    );
  }, []);

  const removePair = useCallback((id: string) => {
    setPairs((current) => current.filter((pair) => pair.id !== id));
  }, []);

  const addPair = useCallback(() => {
    setPairs((current) => [...current, { id: generateId(), key: '', value: '' }]);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, pairId: string, field: 'key' | 'value') => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (field === 'key') {
          const valueInput = document.querySelector(
            `[data-pair-id="${pairId}"][data-field="value"]`
          ) as HTMLInputElement;
          valueInput?.focus();
        } else {
          addPair();
          setTimeout(() => {
            const allKeyInputs = document.querySelectorAll('[data-field="key"]');
            const lastInput = allKeyInputs[allKeyInputs.length - 1] as HTMLInputElement;
            lastInput?.focus();
          }, 0);
        }
      }
    },
    [addPair]
  );

  return (
    <div className="space-y-2">
      {pairs.map((pair) => {
        const isDuplicate = pair.key.trim() && duplicateKeys.has(pair.key.trim());

        return (
          <div key={pair.id} className="flex items-center gap-2">
            <Input
              data-pair-id={pair.id}
              data-field="key"
              placeholder={keyPlaceholder}
              value={pair.key}
              onChange={(e) => updatePair(pair.id, 'key', e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, pair.id, 'key')}
              className={cn(
                isDuplicate && 'ring-2 ring-destructive/50 focus-visible:ring-destructive'
              )}
              aria-invalid={isDuplicate || undefined}
            />
            <span className="text-muted-foreground select-none">:</span>
            <Input
              data-pair-id={pair.id}
              data-field="value"
              placeholder={valuePlaceholder}
              value={pair.value}
              onChange={(e) => updatePair(pair.id, 'value', e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, pair.id, 'value')}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removePair(pair.id)}
              aria-label="Remove entry"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        );
      })}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={addPair}
        className="text-primary hover:text-primary"
      >
        <Plus className="h-4 w-4" />
        {addButtonLabel}
      </Button>
    </div>
  );
}
