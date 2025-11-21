import { Info, PlusIcon, TrashIcon, X } from 'lucide-react';
import type { ComponentProps, Dispatch, FC, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  type FieldObject,
  fieldsToJsonSchema,
  findFieldById,
  type JsonSchemaStateData,
  Types,
  type TypeValues,
  useJsonSchemaActions,
  useJsonSchemaStore,
} from '@/features/agent/state/json-schema';
import { cn } from '@/lib/utils';
import { useDidUpdate } from '@/hooks/use-did-update';
import { ArrayIcon, BooleanIcon, EnumIcon, NumberIcon, ObjectIcon, StringIcon } from '../../icons';

const INDENT_PX = 24;

const SelectType: FC<{
  value: TypeValues;
  onValueChange: Dispatch<TypeValues>;
  className?: string;
}> = ({ value, onValueChange, className }) => {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(Types).map(([k, v]) => (
          <SelectItem key={k} value={v}>
            {k}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

interface PropertyProps {
  fieldId: string;
  depth?: number;
  prefix?: ReactNode;
}

const Property: FC<PropertyProps> = ({ fieldId, depth = 0, prefix }) => {
  const selector = useMemo(
    () => (state: JsonSchemaStateData) => ({
      field: findFieldById(state.fields, fieldId),
      hasInPreview: state.hasInPreview,
    }),
    [fieldId]
  );
  const { field, hasInPreview } = useJsonSchemaStore(selector);

  const { updateField, changeType, addChild, removeField, updateEnumValues } =
    useJsonSchemaActions();

  if (!field) {
    return null;
  }

  const indentStyle = depth * INDENT_PX;

  const inputs = (
    <div className="flex gap-2 items-center" style={{ marginLeft: indentStyle }}>
      {prefix ||
        (hasInPreview && (
          <Tooltip>
            <TooltipTrigger asChild>
              {/* without the wrapping div the checkbox doesn't get the data-state="checked" attribute and the styles are not applied */}
              <div>
                <Checkbox
                  // !! fix warning: Checkbox is changing from uncontrolled to controlled.
                  checked={!!field.isPreview}
                  onCheckedChange={(checked) =>
                    updateField(field.id, { isPreview: checked === true })
                  }
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>Mark this field as available immediately in UI</TooltipContent>
          </Tooltip>
        ))}
      <PropertyIcon type={field.type} />
      <SelectType
        value={field.type}
        onValueChange={(nextType) => changeType(field.id, nextType)}
        className="w-25 shrink-0"
      />
      {!prefix && (
        <Input
          placeholder="Property name"
          value={field.name ?? ''}
          onChange={(event) =>
            updateField(field.id, {
              name: event.target.value,
            })
          }
        />
      )}
      <Input
        placeholder="Add description"
        value={field.description ?? ''}
        onChange={(event) =>
          updateField(field.id, {
            description: event.target.value,
          })
        }
      />
      {!prefix && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* without the wrapping div the checkbox doesn't get the data-state="checked" attribute and the styles are not applied */}
              <div>
                <Checkbox
                  checked={field.isRequired}
                  onCheckedChange={(checked) =>
                    updateField(field.id, { isRequired: checked === true })
                  }
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>Mark this field as required</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => {
                  removeField(field.id);
                }}
              >
                <TrashIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Remove property</TooltipContent>
          </Tooltip>
        </>
      )}
    </div>
  );

  switch (field.type) {
    case 'string':
    case 'number':
    case 'boolean': {
      return inputs;
    }
    case 'enum': {
      return (
        <>
          {inputs}
          <div
            style={{ marginLeft: indentStyle + 106 + (prefix ? 0 : 26) }}
            className="min-h-9 flex flex-wrap items-center gap-2 rounded-md border border-input px-3 py-1 bg-transparent dark:bg-input/30 md:text-sm"
          >
            <TagsInput
              value={field.values ?? []}
              onChange={(values) => updateEnumValues(field.id, values)}
            />
          </div>
        </>
      );
    }
    case 'array': {
      return (
        <>
          {inputs}
          <Property
            fieldId={field.items.id}
            depth={depth + 1}
            prefix={<span className="shrink-0 text-sm mr-[3px]">Array items</span>}
          />
        </>
      );
    }
    case 'object': {
      return (
        <>
          {inputs}
          {field.properties.map((child) => (
            <Property key={child.id} fieldId={child.id} depth={depth + 1 + (prefix ? 3.5 : 0)} />
          ))}
          <Button
            type="button"
            onClick={() => addChild(field.id)}
            variant="link"
            size="sm"
            className="self-start text-xs"
            style={{ marginLeft: indentStyle + 24 + (prefix ? 82 : 0) }}
          >
            <PlusIcon />
            Add property
          </Button>
        </>
      );
    }
  }
  // @ts-expect-error -- fallback
  throw new TypeError(`Unsupported type ${field.type}`);
};

const IconToUse: Record<TypeValues, FC<ComponentProps<'svg'>>> = {
  string: StringIcon,
  number: NumberIcon,
  boolean: BooleanIcon,
  enum: EnumIcon,
  array: ArrayIcon,
  object: ObjectIcon,
};

const ClassToUse: Record<TypeValues, string> = {
  string: 'text-green-500',
  number: 'text-blue-500',
  boolean: 'text-orange-500',
  enum: 'text-yellow-500',
  array: 'text-pink-500',
  object: 'text-purple-500',
};

const PropertyIcon: FC<{ type: TypeValues }> = ({ type }) => {
  const Icon = IconToUse[type];
  if (!Icon) {
    throw new Error(`Unsupported type "${type}"`);
  }
  return <Icon className={cn('shrink-0', ClassToUse[type])} />;
};

export const JsonSchemaBuilder: FC<{
  value: string;
  onChange: (newValue: string) => void;
  hasInPreview?: boolean;
  hasError?: boolean;
}> = ({ value, onChange, hasInPreview, hasError }) => {
  const fields = useJsonSchemaStore((state) => state.fields);
  const { addChild, setFields } = useJsonSchemaActions();
  // Fix race condition in cypress
  const [isHydrated, setIsHydrated] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: run only on mount
  useEffect(() => {
    setFields(value, hasInPreview);
    setIsHydrated(true);
  }, []);

  // Calls only on update to avoid race condition with above useEffect
  useDidUpdate(() => {
    const root: FieldObject = {
      id: '__root__',
      type: 'object',
      properties: fields,
    };
    const schema = fieldsToJsonSchema(root);
    const serialized = JSON.stringify(schema, null, 2);
    onChange(serialized);
  }, [fields, hasInPreview, onChange]);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow noHover className={cn(hasError && '[&>th]:text-destructive')}>
            {hasInPreview && (
              <TableHead className="w-px p-0">
                <div className="flex items-center gap-1">
                  In Preview
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="size-3" />
                    </TooltipTrigger>
                    <TooltipContent className="text-wrap">
                      Specifies which fields will be immediately available.{' '}
                      <a
                        target="_blank"
                        rel="noopener"
                        href="https://docs.inkeep.com/visual-builder/structured-outputs/artifact-components#preview-fields"
                        className="underline text-primary"
                      >
                        Learn more
                      </a>
                      .
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TableHead>
            )}
            <TableHead className={hasInPreview ? 'w-1/10' : 'w-[15%] text-center'}>Type</TableHead>
            <TableHead className="w-[42%] text-center">Name</TableHead>
            <TableHead className="text-center">Description</TableHead>
            <TableHead className="w-px text-right">Required</TableHead>
          </TableRow>
        </TableHeader>
      </Table>
      {fields.map((field) => (
        <Property key={field.id} fieldId={field.id} depth={0} />
      ))}
      <Button
        type="button"
        onClick={() => addChild()}
        variant="link"
        size="sm"
        className="self-start text-xs"
        disabled={!isHydrated}
      >
        <PlusIcon />
        Add property
      </Button>
    </>
  );
};

const TagsInput: FC<{ value: string[]; onChange: (next: string[]) => void }> = ({
  value,
  onChange,
}) => {
  const [input, setInput] = useState('');

  const addTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim();
      if (trimmed && !value.includes(trimmed)) {
        onChange([...value, trimmed]);
      }
    },
    [onChange, value]
  );

  const removeTag = useCallback(
    (tag: string) => {
      onChange(value.filter((t) => t !== tag));
    },
    [onChange, value]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addTag(input);
        setInput('');
      } else if (event.key === 'Backspace' && !input && value.length > 0) {
        removeTag(value[value.length - 1]);
      }
    },
    [addTag, input, removeTag, value]
  );

  return (
    <>
      {value.map((tag) => (
        <Badge
          key={tag}
          variant="secondary"
          className="flex items-center gap-1 rounded-full px-2 py-1"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="ml-1 rounded-full hover:bg-muted p-0.5"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <input
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type possible values and press enter"
        className="grow outline-none"
      />
    </>
  );
};
