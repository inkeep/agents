'use client';

import { useState } from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormFieldWrapper } from './form-field-wrapper';

interface GenericKeyValueInputProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  description?: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  examples?: string[];
}

export function GenericKeyValueInput<T extends FieldValues>({
  control,
  name,
  label,
  description,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  examples = [],
}: GenericKeyValueInputProps<T>) {
  const [currentKey, setCurrentKey] = useState('');
  const [currentValue, setCurrentValue] = useState('');

  return (
    <FormFieldWrapper control={control} name={name} label={label}>
      {(field) => {
        const currentData: Record<string, string> = field.value || {};

        const addKeyValue = () => {
          if (currentKey.trim() && currentValue.trim()) {
            const newData = {
              ...currentData,
              [currentKey.trim()]: currentValue.trim(),
            };
            field.onChange(newData);
            setCurrentKey('');
            setCurrentValue('');
          }
        };

        const removeKeyValue = (keyToRemove: string) => {
          const newData = { ...currentData };
          delete newData[keyToRemove];
          field.onChange(newData);
        };

        const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, isValueField = false) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (isValueField) {
              addKeyValue();
            } else {
              // Move to value field
              const valueInput = e.currentTarget.parentElement?.querySelector(
                'input:nth-child(2)'
              ) as HTMLInputElement;
              valueInput?.focus();
            }
          }
        };

        const handleBlur = () => {
          if (currentKey.trim() && currentValue.trim()) {
            addKeyValue();
          }
        };

        return (
          <div className="space-y-3">
            {/* Display existing key-value pairs */}
            {Object.entries(currentData).length > 0 && (
              <div className="space-y-2">
                {Object.entries(currentData).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2 p-2 border rounded bg-muted/30">
                    <span className="font-medium text-sm">{key}:</span>
                    <span className="text-sm text-muted-foreground flex-1">{value}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeKeyValue(key)}
                      className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive"
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new key-value pair */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder={keyPlaceholder}
                  value={currentKey}
                  onChange={(e) => setCurrentKey(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, false)}
                />
                <Input
                  placeholder={valuePlaceholder}
                  value={currentValue}
                  onChange={(e) => setCurrentValue(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, true)}
                  onBlur={handleBlur}
                />
              </div>
              {(currentKey.trim() || currentValue.trim()) && (
                <p className="text-xs text-muted-foreground">
                  Press Enter or click outside to add this entry
                </p>
              )}
            </div>

            {/* Description and examples */}
            {(description || examples.length > 0) && (
              <div className="text-sm text-muted-foreground">
                {description && <p>{description}</p>}
                {examples.length > 0 && (
                  <p>
                    Examples:{' '}
                    {examples.map((example, index) => (
                      <span key={example}>
                        <code className="bg-muted px-1 py-0.5 rounded text-xs">{example}</code>
                        {index < examples.length - 1 && ', '}
                      </span>
                    ))}
                    .
                  </p>
                )}
              </div>
            )}
          </div>
        );
      }}
    </FormFieldWrapper>
  );
}
