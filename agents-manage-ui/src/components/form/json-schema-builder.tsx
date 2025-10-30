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
import { JSONSchemaFixture } from '@/components/form/__tests__/json-schema-builder.test';

const Types = {
  string: 'str',
  number: 'num',
  boolean: 'bool',
  enum: 'enum',
  array: 'arr',
  object: 'obj',
};

type TypeValues = (typeof Types)[keyof typeof Types];

const SelectType: FC<{
  value: TypeValues;
  onValueChange: Dispatch<'string'>;
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

const Property: FC<{ defaultType: TypeValues }> = ({ defaultType }) => {
  const [type, setType] = useState<TypeValues>(defaultType);

  const inputs = (
    <>
      <PropertyIcon type={type} />
      <SelectType value={type} onValueChange={setType} className="w-57" />
      <Input placeholder="Property name" />
      <Input placeholder="Add description" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Checkbox />
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
    </>
  );

  switch (type) {
    case 'num':
    case 'bool':
    case 'str': {
      return <div className="flex gap-2 items-center">{inputs}</div>;
    }
    case 'enum': {
      return (
        <>
          <div className="flex gap-2 items-center">{inputs}</div>
          <TagsInput />
        </>
      );
    }
    case 'arr': {
      return <PropertyArray>{inputs}</PropertyArray>;
    }
    case 'obj': {
      return (
        <>
          <div className="flex gap-2 items-center">{inputs}</div>
          <Button
            onClick={() => {}}
            variant="secondary"
            size="sm"
            className="self-start"
            style={{ marginLeft: 24 }}
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

const PropertyArray: FC<{ children: ReactNode }> = ({ children }) => {
  const [type, setType] = useState<TypeValues>('str');

  return (
    <>
      <div className="flex gap-2 items-center">{children}</div>
      <div className="flex gap-2 items-center me-8 ms-7.5">
        <PropertyIcon type={type} />
        <span className="shrink-0 md:text-sm">Array items</span>
        <SelectType value={type} onValueChange={setType} />
        <Input placeholder="Add description" />
      </div>
    </>
  );
};

const IconToUse: Record<TypeValues, FC<ComponentProps<'svg'>>> = {
  str: StringIcon,
  num: NumberIcon,
  bool: BooleanIcon,
  enum: EnumIcon,
  arr: ArrayIcon,
  obj: ObjectIcon,
};

const ClassToUse: Record<string, string> = {
  str: 'text-green-500',
  num: 'text-blue-500',
  bool: 'text-orange-500',
  enum: 'text-yellow-500',
  arr: 'text-pink-500',
  obj: 'text-purple-500',
};

const PropertyIcon: FC<{ type: TypeValues }> = ({ type }) => {
  const Icon = IconToUse[type];
  if (!Icon) {
    throw new Error(`Unsupported type "${type}"`);
  }
  return <Icon className={cn('shrink-0', ClassToUse[type])} />;
};

export const JsonSchemaBuilder: FC<{ value: string }> = ({ value }) => {
  const [res] = useState<AllFields[]>(() => {
    try {
      // todo replace with JSON.parse(value) later
      const result = convertJsonSchemaToFields(JSONSchemaFixture);
      return result && result.type === 'object' ? result.properties : [];
    } catch (e) {
      console.error(e);
      return [];
    }
  });
  console.log(res);
  const [properties, setProperties] = useState<ReactNode[]>([]);
  const handleAddProperty = useCallback(() => {
    setProperties((prev) => [...prev, <Property defaultType="str" />]);
  }, []);

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
      <Property defaultType="str" />
      <Property defaultType="num" />
      <Property defaultType="bool" />
      <Property defaultType="enum" />
      <Property defaultType="arr" />
      <Property defaultType="obj" />
      {properties}
      <Button onClick={handleAddProperty} variant="secondary" size="sm" className="self-start">
        <PlusIcon />
        Add property
      </Button>
    </>
  );
};

const TagsInput: FC = () => {
  const [tags, setTags] = useState<string[]>([]);
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
    <div className="ms-33.5 me-13.5 h-9 flex flex-wrap items-center gap-2 rounded-md border border-input px-3 py-1 bg-transparent dark:bg-input/30 md:text-sm">
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
    </div>
  );
};

interface NameAndDescription {
  name?: string;
  description?: string;
  isRequired?: boolean;
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
  const base = {
    ...(name && { name }),
    ...(schema.description && { description: schema.description }),
    ...(isRequired && { isRequired: true }),
  };

  if (schema.type === 'object') {
    const requiredFields: string[] = Array.isArray(schema.required) ? schema.required : [];
    const requiredFieldsSet = new Set(requiredFields);

    const properties =
      schema && typeof schema.properties === 'object'
        ? Object.entries(schema.properties)
            .map(([propertyName, prop]) => {
              // TODO - to pass typecheck
              if (typeof prop === 'boolean') {
                return null;
              }

              return convertJsonSchemaToFields(
                prop,
                propertyName,
                requiredFieldsSet.has(propertyName)
              );
            })
            // Filter unknown keys
            .filter((v) => !!v)
        : [];

    return {
      ...base,
      type: 'object',
      properties,
    };
  }

  if (schema.type === 'array') {
    if (schema && typeof schema.items === 'object') {
      const items = convertJsonSchemaToFields(schema.items);
      return {
        ...base,
        type: 'array',
        items,
      };
    }

    return {
      ...base,
      type: 'array',
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
}
