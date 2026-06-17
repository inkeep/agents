'use client';

import type { PassCriteria, PassCriteriaCondition } from '@inkeep/agents-core/evaluation';
import { MAX_PASS_CRITERIA_DEPTH } from '@inkeep/agents-core/types';
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

type CriteriaNode = PassCriteriaCondition | PassCriteria;

interface PassCriteriaBuilderProps {
  value?: PassCriteria;
  onChange: (value: PassCriteria | undefined) => void;
  schema?: Record<string, unknown>;
  disabled?: boolean;
}

function isGroup(node: CriteriaNode): node is PassCriteria {
  return 'conditions' in node && Array.isArray((node as PassCriteria).conditions);
}

interface SchemaFields {
  numeric: string[];
  boolean: string[];
}

function extractSchemaFields(schema: Record<string, unknown> | undefined): SchemaFields {
  const result: SchemaFields = { numeric: [], boolean: [] };
  if (!schema || typeof schema !== 'object') return result;

  if ('properties' in schema && typeof schema.properties === 'object' && schema.properties) {
    const properties = schema.properties as Record<string, unknown>;
    for (const [key, value] of Object.entries(properties)) {
      if (value && typeof value === 'object' && 'type' in value) {
        const fieldType = (value as { type: unknown }).type;
        if (fieldType === 'number') result.numeric.push(key);
        if (fieldType === 'boolean') result.boolean.push(key);
      }
    }
  }

  result.numeric.sort();
  result.boolean.sort();
  return result;
}

function ConditionRow({
  condition,
  onUpdate,
  onRemove,
  schemaFields,
  disabled,
}: {
  condition: PassCriteriaCondition;
  onUpdate: (updated: PassCriteriaCondition) => void;
  onRemove: () => void;
  schemaFields: SchemaFields;
  disabled?: boolean;
}) {
  const allFields = [...schemaFields.numeric, ...schemaFields.boolean].sort();
  const isBooleanField = schemaFields.boolean.includes(condition.field);
  const booleanOperators = ['=', '!='] as const;
  const numericOperators = ['>', '<', '>=', '<=', '=', '!='] as const;
  const operators = isBooleanField ? booleanOperators : numericOperators;

  return (
    <div className="flex items-center gap-2">
      <Select
        value={condition.field}
        onValueChange={(v) => {
          const switchingToBoolean = schemaFields.boolean.includes(v);
          const switchingToNumeric = schemaFields.numeric.includes(v);
          if (switchingToBoolean && typeof condition.value !== 'boolean') {
            onUpdate({ field: v, operator: '=', value: true });
          } else if (switchingToNumeric && typeof condition.value !== 'number') {
            onUpdate({ field: v, operator: '>', value: 0 });
          } else {
            onUpdate({ ...condition, field: v });
          }
        }}
        disabled={disabled}
      >
        <SelectTrigger className="flex-1">
          <SelectValue placeholder="Select field" />
        </SelectTrigger>
        <SelectContent>
          {allFields.map((field) => (
            <SelectItem key={field} value={field}>
              {field}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={condition.operator}
        onValueChange={(v) => {
          if (isBooleanField) {
            onUpdate({
              field: condition.field,
              operator: v as '=' | '!=',
              value: Boolean(condition.value),
            });
          } else {
            onUpdate({
              field: condition.field,
              operator: v as '>' | '<' | '>=' | '<=' | '=' | '!=',
              value: Number(condition.value),
            });
          }
        }}
        disabled={disabled}
      >
        <SelectTrigger className="w-[80px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {operators.map((op) => (
            <SelectItem key={op} value={op}>
              {op}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isBooleanField ? (
        <Select
          value={String(condition.value)}
          onValueChange={(v) =>
            onUpdate({
              field: condition.field,
              operator: condition.operator as '=' | '!=',
              value: v === 'true',
            })
          }
          disabled={disabled}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">true</SelectItem>
            <SelectItem value="false">false</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <Input
          type="number"
          placeholder="Value"
          value={typeof condition.value === 'number' ? condition.value : 0}
          onChange={(e) => onUpdate({ ...condition, value: Number(e.target.value) })}
          disabled={disabled}
          className="w-[120px]"
        />
      )}

      <Button type="button" variant="ghost" size="icon" onClick={onRemove} disabled={disabled}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function GroupBuilder({
  group,
  onChange,
  onRemove,
  schemaFields,
  disabled,
  depth,
}: {
  group: PassCriteria;
  onChange: (updated: PassCriteria) => void;
  onRemove?: () => void;
  schemaFields: SchemaFields;
  disabled?: boolean;
  depth: number;
}) {
  const allFields = [...schemaFields.numeric, ...schemaFields.boolean].sort();

  const handleAddCondition = () => {
    const defaultField = schemaFields.numeric[0] ?? schemaFields.boolean[0] ?? '';
    const isBool = schemaFields.boolean.includes(defaultField);
    const newCondition: PassCriteriaCondition = isBool
      ? { field: defaultField, operator: '=', value: true }
      : { field: defaultField, operator: '>', value: 0 };
    onChange({ ...group, conditions: [...group.conditions, newCondition] });
  };

  const handleAddGroup = () => {
    const newGroup: PassCriteria = { operator: 'and', conditions: [] };
    onChange({ ...group, conditions: [...group.conditions, newGroup] });
  };

  const handleUpdateChild = (index: number, updated: CriteriaNode) => {
    const newConditions = [...group.conditions];
    newConditions[index] = updated;
    onChange({ ...group, conditions: newConditions });
  };

  const handleRemoveChild = (index: number) => {
    const newConditions = group.conditions.filter((_, i) => i !== index);
    if (newConditions.length === 0 && onRemove) {
      onRemove();
    } else {
      onChange({ ...group, conditions: newConditions });
    }
  };

  return (
    <div className={depth > 0 ? 'rounded-lg border p-3 space-y-3 bg-muted/30' : 'space-y-3'}>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Match</span>
        <Select
          value={group.operator}
          onValueChange={(v) => onChange({ ...group, operator: v as 'and' | 'or' })}
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
        <span className="text-sm text-muted-foreground">of the following:</span>
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            disabled={disabled}
            className="ml-auto"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {group.conditions.map((child, index) =>
          isGroup(child) ? (
            <GroupBuilder
              key={index}
              group={child}
              onChange={(updated) => handleUpdateChild(index, updated)}
              onRemove={() => handleRemoveChild(index)}
              schemaFields={schemaFields}
              disabled={disabled}
              depth={depth + 1}
            />
          ) : (
            <ConditionRow
              key={index}
              condition={child}
              onUpdate={(updated) => handleUpdateChild(index, updated)}
              onRemove={() => handleRemoveChild(index)}
              schemaFields={schemaFields}
              disabled={disabled}
            />
          )
        )}
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddCondition}
          disabled={disabled || allFields.length === 0}
        >
          <Plus className="h-4 w-4" />
          Condition
        </Button>
        {depth < MAX_PASS_CRITERIA_DEPTH && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddGroup}
            disabled={disabled}
          >
            <Plus className="h-4 w-4" />
            Group
          </Button>
        )}
      </div>
    </div>
  );
}

function renderExpression(node: CriteriaNode): string {
  if (!isGroup(node)) {
    const val = typeof node.value === 'boolean' ? String(node.value) : node.value;
    return `${node.field || '(field)'} ${node.operator} ${val}`;
  }
  if (node.conditions.length === 0) return '(empty)';
  const joiner = node.operator === 'and' ? ' AND ' : ' OR ';
  const parts = node.conditions.map((child) => {
    const expr = renderExpression(child);
    return isGroup(child) ? `(${expr})` : expr;
  });
  return parts.join(joiner);
}

export function PassCriteriaBuilder({
  value,
  onChange,
  schema,
  disabled,
}: PassCriteriaBuilderProps) {
  const criteria = value || { operator: 'and' as const, conditions: [] };
  const schemaFields = extractSchemaFields(schema);
  const allFields = [...schemaFields.numeric, ...schemaFields.boolean];
  const hasConditions = criteria.conditions.length > 0;

  const handleClear = () => onChange(undefined);

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
          <GroupBuilder
            group={criteria}
            onChange={onChange as (v: PassCriteria) => void}
            schemaFields={schemaFields}
            disabled={disabled}
            depth={0}
          />
        </div>
      )}

      {allFields.length === 0 && !hasConditions ? (
        <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded">
          <strong>Note:</strong> Define your output schema with numeric or boolean fields first.
          Then you can add pass/fail conditions based on those fields.
        </div>
      ) : (
        <>
          {!hasConditions && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const defaultField = schemaFields.numeric[0] ?? schemaFields.boolean[0] ?? '';
                  const isBool = schemaFields.boolean.includes(defaultField);
                  const newCondition: PassCriteriaCondition = isBool
                    ? { field: defaultField, operator: '=', value: true }
                    : { field: defaultField, operator: '>', value: 0 };
                  onChange({ ...criteria, conditions: [newCondition] });
                }}
                disabled={disabled || allFields.length === 0}
              >
                <Plus className="h-4 w-4" />
                Add Condition
              </Button>
            </div>
          )}

          {hasConditions && (
            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded">
              <strong>Expression:</strong> Pass when{' '}
              <code className="bg-background px-1 py-0.5 rounded">
                {renderExpression(criteria)}
              </code>
            </div>
          )}
        </>
      )}
    </div>
  );
}
