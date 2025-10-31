import type { ComponentProps, Dispatch, FC, ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { PlusIcon, TrashIcon, X } from 'lucide-react';
import { StringIcon, NumberIcon, BooleanIcon, EnumIcon, ArrayIcon, ObjectIcon } from './icons';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Table, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import type { JSONSchema7 } from 'json-schema';
import { JSONSchemaFixture } from '@/components/form/__tests__/json-schema-fixture';

const Types = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  enum: 'enum',
  array: 'array',
  object: 'object',
};

type TypeValues = keyof typeof Types;

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

const Property: FC<{
  field: AllFields;
  depth?: number;
  prefix?: ReactNode;
  suffix?: ReactNode;
}> = ({ field, depth = 0, prefix }) => {
  const [type, setType] = useState<TypeValues>(field.type);
  const indentStyle = depth * INDENT_PX;

  const inputs = (
    <div className="flex gap-2 items-center" style={{ marginLeft: indentStyle }}>
      {prefix}
      <PropertyIcon type={type} />
      <SelectType value={type} onValueChange={setType} className="w-57" />
      <Input placeholder="Property name" defaultValue={field.name} />
      <Input placeholder="Add description" defaultValue={field.description} />
      <Tooltip>
        <TooltipTrigger asChild>
          <Checkbox defaultChecked={field.isRequired} />
        </TooltipTrigger>
        <TooltipContent>Mark this field as required</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon-sm" variant="ghost">
            <TrashIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Remove property</TooltipContent>
      </Tooltip>
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
            style={{ marginLeft: indentStyle + 130 }}
            className="h-9 flex flex-wrap items-center gap-2 rounded-md border border-input px-3 py-1 bg-transparent dark:bg-input/30 md:text-sm"
          >
            <TagsInput initialTags={field.values} depth={depth + 1} />
          </div>
        </>
      );
    }
    case 'array': {
      return (
        <>
          {inputs}
          <Property
            field={{
              ...field.items,
              name: field.items.name ?? 'items',
            }}
            depth={depth + 1}
            prefix={<span className="shrink-0 text-sm">Array items</span>}
            suffix={null}
          />
        </>
      );
    }
    case 'object': {
      return (
        <>
          {inputs}
          {field.properties.map((child, index) => (
            <Property
              key={child.name ?? `field-${depth}-${index}`}
              field={child}
              depth={depth + 1 + (prefix ? 3.5 : 0)}
            />
          ))}
          <Button
            onClick={() => {}}
            variant="secondary"
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
    default: {
      throw new TypeError(`Unsupported type ${type}`);
    }
  }
};

const IconToUse: Record<TypeValues, FC<ComponentProps<'svg'>>> = {
  string: StringIcon,
  number: NumberIcon,
  boolean: BooleanIcon,
  enum: EnumIcon,
  array: ArrayIcon,
  object: ObjectIcon,
};

const ClassToUse: Record<string, string> = {
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

export const JsonSchemaBuilder: FC<{ value: string }> = ({ value }) => {
  const [fields] = useState<AllFields[]>(() => {
    try {
      // todo replace with JSON.parse(value) later
      const result = convertJsonSchemaToFields(JSONSchemaFixture);
      return result && result.type === 'object' ? result.properties : [];
    } catch (e) {
      console.error(e);
      return [];
    }
  });
  // const fields = useMemo(() => {
  //   if (typeof value !== 'string' || value.trim().length === 0) {
  //     return [] as AllFields[];
  //   }
  //
  //   try {
  //     const parsed = JSON.parse(value) as JSONSchema7;
  //     const converted = convertJsonSchemaToFields(parsed);
  //     if (!converted) return [];
  //     if (converted.type === 'object') {
  //       return (converted.properties ?? []).filter((child): child is AllFields => Boolean(child));
  //     }
  //     return [converted];
  //   } catch (error) {
  //     console.error('Failed to parse schema for builder', error);
  //     return [] as AllFields[];
  //   }
  // }, [value]);

  return (
    <>
      <p>Properties</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[15%] text-center">Type</TableHead>
            <TableHead className="w-[42%] text-center">Name</TableHead>
            <TableHead className="text-center">Description</TableHead>
            <TableHead className="w-px text-right">Required</TableHead>
          </TableRow>
        </TableHeader>
      </Table>
      {fields.map((field, index) => (
        <Property key={field.name ?? `root-${index}`} field={field} depth={0} />
      ))}
    </>
  );
};

const TagsInput: FC<{ initialTags?: string[] }> = ({ initialTags = [] }) => {
  const [tags, setTags] = useState<string[]>(initialTags);
  const [input, setInput] = useState('');

  const addTag = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(input);
      setInput('');
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <>
      {tags.map((tag) => (
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
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type possible values and press enter"
        className="grow outline-none"
      />
    </>
  );
};

interface NameAndDescription {
  name?: string;
  description?: string;
  isRequired?: boolean;
  title?: string;
}

type AllFields = FieldString | FieldNumber | FieldBoolean | FieldEnum | FieldArray | FieldObject;

interface FieldString extends NameAndDescription {
  type: 'string';
}

interface FieldNumber extends NameAndDescription {
  type: 'number';
}

interface FieldBoolean extends NameAndDescription {
  type: 'boolean';
}

interface FieldEnum extends NameAndDescription {
  type: 'enum';
  values: string[];
}
interface FieldArray extends NameAndDescription {
  type: 'array';
  items?: AllFields;
}
interface FieldObject extends NameAndDescription {
  type: 'object';
  properties: AllFields[];
}

export function convertJsonSchemaToFields(
  schema: JSONSchema7,
  name?: string,
  isRequired = false
): AllFields | undefined {
  const base: NameAndDescription = {
    ...(name && { name }),
    ...(schema.description && { description: schema.description }),
    ...(schema.title && { title: schema.title }),
    ...(isRequired && { isRequired: true }),
  };

  if (schema.type === 'object') {
    const requiredFields: string[] = Array.isArray(schema.required) ? schema.required : [];
    const requiredFieldsSet = new Set(requiredFields);

    const properties =
      schema && typeof schema.properties === 'object'
        ? Object.entries(schema.properties).reduce<AllFields[]>((acc, [propertyName, prop]) => {
            // TODO - to pass typecheck
            if (typeof prop === 'boolean') {
              return acc;
            }
            const child = convertJsonSchemaToFields(
              prop,
              propertyName,
              requiredFieldsSet.has(propertyName)
            );
            if (child) {
              acc.push(child);
            }
            return acc;
          }, [])
        : [];

    return {
      ...base,
      type: 'object',
      properties,
    };
  }

  if (schema.type === 'array') {
    let items: AllFields | undefined;
    if (schema && typeof schema.items === 'object') {
      // @ts-expect-error todo: should we support Array of items?
      items = convertJsonSchemaToFields(schema.items);
    }

    if (!items) {
      items = {
        type: 'string',
      };
    }

    return {
      ...base,
      type: 'array',
      items,
    };
  }

  if (schema.type === 'string') {
    if (Array.isArray(schema.enum)) {
      return {
        ...base,
        type: 'enum',
        values: schema.enum.map(String),
      };
    }

    return {
      ...base,
      type: 'string',
    };
  }

  if (schema.type === 'number' || schema.type === 'integer') {
    return {
      ...base,
      type: 'number',
    };
  }

  if (schema.type === 'boolean') {
    return {
      ...base,
      type: 'boolean',
    };
  }

  return {
    ...base,
    type: 'string',
  };
}

const applyCommonMetadata = (schema: JSONSchema7, field: NameAndDescription) => {
  if (field.description) {
    schema.description = field.description;
  }
  if (field.title) {
    schema.title = field.title;
  }
  return schema;
};

const buildJsonSchemaFromField = (
  field: AllFields | undefined,
  options: { inArray?: boolean } = {}
): JSONSchema7 => {
  if (!field) {
    return { type: 'string', default: '' };
  }

  switch (field.type) {
    case 'object': {
      const properties: Record<string, JSONSchema7> = {};
      const required: string[] = [];

      for (const property of field.properties ?? []) {
        if (!property || !property.name) continue;
        properties[property.name] = buildJsonSchemaFromField(property);
        if (property.isRequired) {
          required.push(property.name);
        }
      }

      const schema: JSONSchema7 = {
        type: 'object',
        properties,
        additionalProperties: false,
      };
      applyCommonMetadata(schema, field);
      if (required.length > 0) {
        schema.required = required;
      }
      return schema;
    }
    case 'array': {
      const items = buildJsonSchemaFromField(field.items, { inArray: true });
      const schema: JSONSchema7 = {
        type: 'array',
        items,
        default: [],
      };
      applyCommonMetadata(schema, field);
      return schema;
    }
    case 'enum': {
      const schema: JSONSchema7 = {
        type: 'string',
        enum: field.values,
      };
      if (!options.inArray) {
        schema.default = '';
      }
      applyCommonMetadata(schema, field);
      return schema;
    }
    case 'number': {
      const schema: JSONSchema7 = {
        type: 'number',
      };
      applyCommonMetadata(schema, field);
      return schema;
    }
    case 'boolean': {
      const schema: JSONSchema7 = {
        type: 'boolean',
      };
      applyCommonMetadata(schema, field);
      return schema;
    }
    case 'string':
    default: {
      const schema: JSONSchema7 = {
        type: 'string',
      };
      if (!options.inArray) {
        schema.default = '';
      }
      applyCommonMetadata(schema, field);
      return schema;
    }
  }
};

export const fieldsToJsonSchema = (fields: AllFields | undefined): JSONSchema7 => {
  return buildJsonSchemaFromField(fields);
};
