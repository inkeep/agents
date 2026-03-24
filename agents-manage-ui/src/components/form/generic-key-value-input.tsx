'use client';

import { Plus, X } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { useFieldArray, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { FormControl, FormField, FormItem } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface GenericKeyValueInputProps<FV extends FieldValues, TV = FieldValues> {
  control: Control<FV, unknown, TV>;
  name: FieldPath<FV>;
  label: string;
  description?: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addButtonLabel?: string;
  isRequired?: boolean;
  disabled?: boolean;
}

/**
 * A key-value input component using react-hook-form's useFieldArray.
 *
 * Expected form schema shape:
 * ```ts
 * z.object({
 *   headers: z.array(z.object({
 *     key: z.string(),
 *     value: z.string(),
 *   })).default([])
 * })
 * ```
 *
 * Convert to record on submit using `keyValuePairsToRecord()` helper.
 */
export function GenericKeyValueInput<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues,
>({
  control,
  name,
  label,
  description,
  keyPlaceholder = 'key',
  valuePlaceholder = 'value',
  addButtonLabel = 'Add item',
  isRequired,
  disabled = false,
}: GenericKeyValueInputProps<TFieldValues, TTransformedValues>) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: name as never,
  });

  const watchedFields = useWatch({ control, name: name as never }) as
    | { key: string; value: string }[]
    | undefined;

  const duplicateKeys = useMemo(() => {
    if (!watchedFields) return new Set<string>();
    const keys = watchedFields.map((f) => f.key?.trim()).filter(Boolean);
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const key of keys) {
      if (seen.has(key)) {
        duplicates.add(key);
      }
      seen.add(key);
    }
    return duplicates;
  }, [watchedFields]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, index: number, field: 'key' | 'value') => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (field === 'key') {
          const valueInput = document.querySelector<HTMLInputElement>(
            `[data-index="${index}"][data-field="value"]`
          );
          valueInput?.focus();
        } else {
          append({ key: '', value: '' } as never);
          setTimeout(() => {
            const keyInput = document.querySelector<HTMLInputElement>(
              `[data-index="${index + 1}"][data-field="key"]`
            );
            keyInput?.focus();
          }, 0);
        }
      }
    },
    [append]
  );

  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium leading-none">
        {label}
        {isRequired && <span className="text-red-500">*</span>}
      </span>
      <div className="space-y-2">
        {fields.map((field, index) => {
          const currentKey = watchedFields?.[index]?.key?.trim() || '';
          const isDuplicate = currentKey && duplicateKeys.has(currentKey);

          return (
            <div key={field.id} className="flex items-center gap-2">
              <FormField
                control={control}
                name={`${name}.${index}.key` as FieldPath<TFieldValues>}
                render={({ field: keyField }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Input
                        {...keyField}
                        data-index={index}
                        data-field="key"
                        placeholder={keyPlaceholder}
                        onKeyDown={(e) => handleKeyDown(e, index, 'key')}
                        className={cn(
                          isDuplicate && 'ring-2 ring-destructive/50 focus-visible:ring-destructive'
                        )}
                        aria-invalid={isDuplicate || undefined}
                        disabled={disabled}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <span className="text-muted-foreground select-none">:</span>
              <FormField
                control={control}
                name={`${name}.${index}.value` as FieldPath<TFieldValues>}
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Input
                        {...field}
                        data-index={index}
                        data-field="value"
                        placeholder={valuePlaceholder}
                        onKeyDown={(e) => handleKeyDown(e, index, 'value')}
                        disabled={disabled}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              {!disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(index)}
                  aria-label="Remove entry"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}

        {!disabled && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => append({ key: '', value: '' } as never)}
            className="text-primary hover:text-primary"
          >
            <Plus className="h-4 w-4" />
            {addButtonLabel}
          </Button>
        )}
      </div>

      {description && <p className="text-[0.8rem] text-muted-foreground">{description}</p>}
      {duplicateKeys.size > 0 && (
        <p className="text-sm font-medium text-destructive">
          Keys must be unique. Duplicate keys: {Array.from(duplicateKeys).join(', ')}
        </p>
      )}
    </div>
  );
}
