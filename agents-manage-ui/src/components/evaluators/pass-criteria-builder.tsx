'use client';

import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface PassCriteriaCondition {
  field: string;
  operator: '>' | '<' | '>=' | '<=' | '=' | '!=';
  value: number;
}

export interface PassCriteria {
  operator: 'and' | 'or';
  conditions: PassCriteriaCondition[];
}

interface PassCriteriaBuilderProps {
  value?: PassCriteria;
  onChange: (value: PassCriteria | undefined) => void;
  schema?: Record<string, unknown>;
  disabled?: boolean;
}

function extractNumericFields(schema: Record<string, unknown> | undefined): string[] {
  if (!schema || typeof schema !== 'object') {
    return [];
  }

  const fields: string[] = [];

  if ('properties' in schema && typeof schema.properties === 'object' && schema.properties) {
    const properties = schema.properties as Record<string, unknown>;
    for (const [key, value] of Object.entries(properties)) {
      if (value && typeof value === 'object' && 'type' in value) {
        const fieldType = (value as { type: unknown }).type;
        if (fieldType === 'number') {
          fields.push(key);
        }
      }
    }
  }

  return fields.sort();
}

export function PassCriteriaBuilder({
  value,
  onChange,
  schema,
  disabled,
}: PassCriteriaBuilderProps) {
  const criteria = value || { operator: 'and', conditions: [] };
  const numericFields = extractNumericFields(schema);

  const handleOperatorChange = (operator: 'and' | 'or') => {
    onChange({ ...criteria, operator });
  };

  const handleAddCondition = () => {
    onChange({
      ...criteria,
      conditions: [...criteria.conditions, { field: '', operator: '>', value: 0 }],
    });
  };

  const handleRemoveCondition = (index: number) => {
    const newConditions = criteria.conditions.filter((_, i) => i !== index);
    if (newConditions.length === 0) {
      onChange(undefined);
    } else {
      onChange({ ...criteria, conditions: newConditions });
    }
  };

  const handleConditionChange = (
    index: number,
    field: keyof PassCriteriaCondition,
    value: string | number
  ) => {
    const newConditions = [...criteria.conditions];
    if (field === 'value') {
      newConditions[index] = { ...newConditions[index], [field]: Number(value) };
    } else {
      newConditions[index] = { ...newConditions[index], [field]: value };
    }
    onChange({ ...criteria, conditions: newConditions });
  };

  const handleClear = () => {
    onChange(undefined);
  };

  const hasConditions = criteria.conditions.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Label>Pass/Fail Criteria (Optional)</Label>
          <p className="text-sm text-muted-foreground">
            Define conditions that determine if an evaluation passes or fails
          </p>
        </div>
        {hasConditions && (
          <Button type="button" variant="ghost" size="sm" onClick={handleClear} disabled={disabled}>
            Clear All
          </Button>
        )}
      </div>

      {hasConditions && (
        <div className="rounded-lg border p-4 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Pass when</span>
            <Select
              value={criteria.operator}
              onValueChange={(v) => handleOperatorChange(v as 'and' | 'or')}
              disabled={disabled}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="and">ALL</SelectItem>
                <SelectItem value="or">ANY</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">conditions are met:</span>
          </div>

          <div className="space-y-2">
            {criteria.conditions.map((condition, index) => (
              <div key={index} className="flex items-center gap-2">
                <Select
                  value={condition.field}
                  onValueChange={(v) => handleConditionChange(index, 'field', v)}
                  disabled={disabled}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select field" />
                  </SelectTrigger>
                  <SelectContent>
                    {numericFields.map((field) => (
                      <SelectItem key={field} value={field}>
                        {field}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={condition.operator}
                  onValueChange={(v) =>
                    handleConditionChange(index, 'operator', v as PassCriteriaCondition['operator'])
                  }
                  disabled={disabled}
                >
                  <SelectTrigger className="w-[80px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=">">{'>'}</SelectItem>
                    <SelectItem value="<">{'<'}</SelectItem>
                    <SelectItem value=">=">{'>='}</SelectItem>
                    <SelectItem value="<=">{'<='}</SelectItem>
                    <SelectItem value="=">{'='}</SelectItem>
                    <SelectItem value="!=">{'!='}</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  placeholder="Value"
                  value={condition.value}
                  onChange={(e) => handleConditionChange(index, 'value', e.target.value)}
                  disabled={disabled}
                  className="w-[120px]"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveCondition(index)}
                  disabled={disabled}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {numericFields.length === 0 && !hasConditions ? (
        <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded">
          <strong>Note:</strong> Define your output schema with numeric fields (type: "number") first. Then you can add pass/fail conditions based on those fields.
        </div>
      ) : (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddCondition}
            disabled={disabled || numericFields.length === 0}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Condition
          </Button>

          {hasConditions && (
            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded">
              <strong>Expression:</strong> Pass when{' '}
              {criteria.conditions.map((cond, index) => (
                <span key={index}>
                  {index > 0 && (
                    <span className="mx-1">{criteria.operator === 'and' ? 'AND' : 'OR'}</span>
                  )}
                  <code className="bg-background px-1 py-0.5 rounded">
                    {cond.field || '(field)'} {cond.operator} {cond.value}
                  </code>
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

