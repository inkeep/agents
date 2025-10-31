import type { ComponentProps, FC, ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

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
const ROOT_ID = '__root__';

let fieldIdCounter = 0;

const createFieldId = () => `field-${++fieldIdCounter}`;

const resetFieldIdCounter = () => {
  fieldIdCounter = 0;
};

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

type EditableField =
  | (FieldString & { id: string })
  | (FieldNumber & { id: string })
  | (FieldBoolean & { id: string })
  | (FieldEnum & { id: string })
  | (FieldArray & { id: string; items: EditableField })
  | (FieldObject & { id: string; properties: EditableField[] });

type FieldPatch = Partial<
  Pick<NameAndDescription, 'name' | 'description' | 'isRequired' | 'title'>
>;

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

export const fieldsToJsonSchema = (field: AllFields | undefined): JSONSchema7 => {
  if (!field) {
    return { type: 'string' };
  }

  switch (field.type) {
    case 'object': {
      const properties: Record<string, JSONSchema7> = {};
      const required: string[] = [];

      for (const property of field.properties ?? []) {
        if (!property || !property.name) continue;
        properties[property.name] = fieldsToJsonSchema(property);
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
      const items = fieldsToJsonSchema(field.items);
      const schema: JSONSchema7 = {
        type: 'array',
        items,
      };
      applyCommonMetadata(schema, field);
      return schema;
    }
    case 'enum': {
      const schema: JSONSchema7 = {
        type: 'string',
        enum: field.values,
      };
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
      applyCommonMetadata(schema, field);
      return schema;
    }
  }
};

const applyPatchToField = (field: EditableField, patch: FieldPatch): EditableField => ({
  ...field,
  ...patch,
});

const createEditableField = (type: TypeValues): EditableField => {
  const id = createFieldId();
  switch (type) {
    case 'object':
      return { id, type: 'object', properties: [] };
    case 'array':
      return { id, type: 'array', items: createEditableField('string') };
    case 'enum':
      return { id, type: 'enum', values: [] };
    case 'number':
      return { id, type: 'number' };
    case 'boolean':
      return { id, type: 'boolean' };
    case 'string':
    default:
      return { id, type: 'string' };
  }
};

const changeEditableFieldType = (field: EditableField, type: TypeValues): EditableField => {
  if (field.type === type) {
    return field;
  }

  switch (type) {
    case 'object':
      return {
        id: field.id,
        name: field.name,
        description: field.description,
        isRequired: field.isRequired,
        title: field.title,
        type: 'object',
        properties: field.type === 'object' ? field.properties : [],
      };
    case 'array':
      return {
        id: field.id,
        name: field.name,
        description: field.description,
        isRequired: field.isRequired,
        title: field.title,
        type: 'array',
        items: field.type === 'array' ? field.items : createEditableField('string'),
      };
    case 'enum':
      return {
        id: field.id,
        name: field.name,
        description: field.description,
        isRequired: field.isRequired,
        title: field.title,
        type: 'enum',
        values: field.type === 'enum' ? (field.values ?? []) : [],
      };
    case 'number':
      return {
        id: field.id,
        name: field.name,
        description: field.description,
        isRequired: field.isRequired,
        title: field.title,
        type: 'number',
      };
    case 'boolean':
      return {
        id: field.id,
        name: field.name,
        description: field.description,
        isRequired: field.isRequired,
        title: field.title,
        type: 'boolean',
      };
    case 'string':
    default:
      return {
        id: field.id,
        name: field.name,
        description: field.description,
        isRequired: field.isRequired,
        title: field.title,
        type: 'string',
      };
  }
};

const updateEditableField = (
  field: EditableField,
  id: string,
  updater: (candidate: EditableField) => EditableField
): [EditableField, boolean] => {
  if (field.id === id) {
    const updated = updater(field);
    return [updated, updated !== field];
  }

  if (field.type === 'object') {
    const [properties, changed] = updateEditableFields(field.properties, id, updater);
    if (changed) {
      return [{ ...field, properties }, true];
    }
  } else if (field.type === 'array') {
    const [items, changed] = updateEditableField(field.items, id, updater);
    if (changed) {
      return [{ ...field, items }, true];
    }
  }

  return [field, false];
};

const updateEditableFields = (
  fields: EditableField[],
  id: string,
  updater: (candidate: EditableField) => EditableField
): [EditableField[], boolean] => {
  let changed = false;
  const next = fields.map((field) => {
    const [updated, hasChanged] = updateEditableField(field, id, updater);
    if (hasChanged) {
      changed = true;
    }
    return updated;
  });
  return changed ? [next, true] : [fields, false];
};

const addChildToEditableField = (
  field: EditableField,
  parentId: string,
  child: EditableField
): [EditableField, boolean] => {
  if (field.id === parentId) {
    if (field.type === 'object') {
      return [{ ...field, properties: [...field.properties, child] }, true];
    }
    return [field, false];
  }

  if (field.type === 'object') {
    const [properties, changed] = addChildToEditableTree(field.properties, parentId, child);
    if (changed) {
      return [{ ...field, properties }, true];
    }
  } else if (field.type === 'array') {
    const [items, changed] = addChildToEditableField(field.items, parentId, child);
    if (changed) {
      return [{ ...field, items }, true];
    }
  }

  return [field, false];
};

type MutableChildren = [EditableField[], boolean];
const addChildToEditableTree = (
  fields: EditableField[],
  parentId: string,
  child: EditableField
): MutableChildren => {
  let changed = false;
  const next: EditableField[] = [];

  for (const field of fields) {
    if (field.id === parentId && field.type === 'object') {
      changed = true;
      next.push({ ...field, properties: [...field.properties, child] });
      continue;
    }

    if (field.type === 'object') {
      const [properties, childChanged] = addChildToEditableTree(field.properties, parentId, child);
      if (childChanged) {
        changed = true;
        next.push({ ...field, properties });
        continue;
      }
    } else if (field.type === 'array') {
      const [items, childChanged] = addChildToEditableField(field.items, parentId, child);
      if (childChanged) {
        changed = true;
        next.push({ ...field, items });
        continue;
      }
    }

    next.push(field);
  }

  return [changed ? next : fields, changed];
};

const removeEditableField = (field: EditableField, id: string): [EditableField | null, boolean] => {
  if (field.id === id) {
    return [null, true];
  }

  if (field.type === 'object') {
    const [properties, changed] = removeEditableFieldFromTree(field.properties, id);
    if (changed) {
      return [{ ...field, properties }, true];
    }
  } else if (field.type === 'array') {
    const [items, changed] = removeEditableField(field.items, id);
    if (changed && items) {
      return [{ ...field, items }, true];
    }
  }

  return [field, false];
};

const removeEditableFieldFromTree = (fields: EditableField[], id: string): MutableChildren => {
  let changed = false;
  const next: EditableField[] = [];

  for (const field of fields) {
    const [updated, didChange] = removeEditableField(field, id);
    if (didChange) {
      changed = true;
      if (updated) {
        next.push(updated);
      }
      continue;
    }
    next.push(field);
  }

  return [changed ? next : fields, changed];
};

const addIdsToField = (field: AllFields): EditableField => {
  const id = createFieldId();
  switch (field.type) {
    case 'object':
      return {
        ...field,
        id,
        properties: (field.properties ?? []).map(addIdsToField),
      };
    case 'array':
      return {
        ...field,
        id,
        items: addIdsToField(field.items ?? { type: 'string' }),
      };
    case 'enum':
      return {
        ...field,
        id,
        values: field.values ?? [],
      };
    case 'number':
    case 'boolean':
    case 'string':
    default:
      return {
        ...field,
        id,
      };
  }
};

const addIdsToFields = (fields: AllFields[]): EditableField[] => fields.map(addIdsToField);

const stripIdsFromField = (field: EditableField): AllFields => {
  const base: NameAndDescription = {};
  if (field.name && field.name !== '') base.name = field.name;
  if (field.description) base.description = field.description;
  if (field.title) base.title = field.title;
  if (field.isRequired) base.isRequired = true;

  switch (field.type) {
    case 'object':
      return {
        ...base,
        type: 'object',
        properties: field.properties.map(stripIdsFromField),
      };
    case 'array':
      return {
        ...base,
        type: 'array',
        items: stripIdsFromField(field.items),
      };
    case 'enum':
      return {
        ...base,
        type: 'enum',
        values: field.values ?? [],
      };
    case 'number':
      return {
        ...base,
        type: 'number',
      };
    case 'boolean':
      return {
        ...base,
        type: 'boolean',
      };
    case 'string':
    default:
      return {
        ...base,
        type: 'string',
      };
  }
};

const stripIdsFromFields = (fields: EditableField[]): AllFields[] => fields.map(stripIdsFromField);

interface ParsedSchemaResult {
  fields: AllFields[];
  metadata: Pick<NameAndDescription, 'title' | 'description'>;
}

const parseFieldsFromJson = (value: string): ParsedSchemaResult => {
  resetFieldIdCounter();
  if (!value || value.trim().length === 0) {
    return { fields: [], metadata: {} };
  }

  try {
    const parsed = JSON.parse(value) as JSONSchema7;
    const result = convertJsonSchemaToFields(parsed);
    if (!result) {
      return { fields: [], metadata: {} };
    }

    const metadata = {
      title: result.title,
      description: result.description,
    } satisfies Pick<NameAndDescription, 'title' | 'description'>;

    if (result.type === 'object') {
      return { fields: result.properties ?? [], metadata };
    }

    return { fields: [result], metadata };
  } catch (error) {
    console.error('Failed to parse schema for builder', error);
    return { fields: [], metadata: {} };
  }
};

interface JsonSchemaBuilderStore {
  fields: EditableField[];
  metadata: ParsedSchemaResult['metadata'];
  reset: (data: ParsedSchemaResult) => void;
  updateField: (id: string, patch: FieldPatch) => void;
  changeType: (id: string, type: TypeValues) => void;
  addChild: (parentId: string) => void;
  removeField: (id: string) => void;
  updateEnumValues: (id: string, values: string[]) => void;
}

const createJsonSchemaBuilderStore = (
  initial: ParsedSchemaResult
): StoreApi<JsonSchemaBuilderStore> => {
  resetFieldIdCounter();
  const initialEditable = addIdsToFields(initial.fields);
  return createStore<JsonSchemaBuilderStore>((set) => ({
    fields: initialEditable,
    metadata: { ...initial.metadata },
    reset: (data) => {
      resetFieldIdCounter();
      set({ fields: addIdsToFields(data.fields), metadata: { ...data.metadata } });
    },
    updateField: (id, patch) =>
      set((state) => {
        const [fields, changed] = updateEditableFields(state.fields, id, (candidate) =>
          applyPatchToField(candidate, patch)
        );
        return changed ? { fields } : {};
      }),
    changeType: (id, type) =>
      set((state) => {
        const [fields, changed] = updateEditableFields(state.fields, id, (candidate) =>
          changeEditableFieldType(candidate, type)
        );
        return changed ? { fields } : {};
      }),
    addChild: (parentId) =>
      set((state) => {
        const child = createEditableField('string');
        if (parentId === ROOT_ID) {
          return { fields: [...state.fields, child] };
        }
        const [fields, changed] = addChildToEditableTree(state.fields, parentId, child);
        return changed ? { fields } : {};
      }),
    removeField: (id) =>
      set((state) => {
        const filtered = state.fields.filter((field) => field.id !== id);
        if (filtered.length !== state.fields.length) {
          return { fields: filtered };
        }
        const [fields, changed] = removeEditableFieldFromTree(state.fields, id);
        return changed ? { fields } : {};
      }),
    updateEnumValues: (id, values) =>
      set((state) => {
        const [fields, changed] = updateEditableFields(state.fields, id, (candidate) =>
          candidate.type === 'enum' ? { ...candidate, values } : candidate
        );
        return changed ? { fields } : {};
      }),
  }));
};

const JsonSchemaBuilderStoreContext = createContext<StoreApi<JsonSchemaBuilderStore> | null>(null);

const useSchemaStoreSelector = <T,>(selector: (state: JsonSchemaBuilderStore) => T) => {
  const store = useContext(JsonSchemaBuilderStoreContext);
  if (!store) {
    throw new Error('JsonSchemaBuilder store not found in context');
  }
  return useStore(store, selector);
};

const findFieldById = (fields: EditableField[], id: string): EditableField | undefined => {
  for (const field of fields) {
    const found = findFieldRecursively(field, id);
    if (found) {
      return found;
    }
  }
  return undefined;
};

const findFieldRecursively = (field: EditableField, id: string): EditableField | undefined => {
  if (field.id === id) {
    return field;
  }
  if (field.type === 'object') {
    for (const child of field.properties) {
      const found = findFieldRecursively(child, id);
      if (found) {
        return found;
      }
    }
  } else if (field.type === 'array') {
    return findFieldRecursively(field.items, id);
  }
  return undefined;
};
