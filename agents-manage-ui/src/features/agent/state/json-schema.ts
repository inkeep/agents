import type { JSONSchema7 } from 'json-schema';
import { nanoid } from 'nanoid';
import { create, type StateCreator } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

const ROOT_ID = '__root__';

export interface JSONSchemaWithPreview extends JSONSchema7 {
  inPreview?: boolean;
}

type TypeValues = keyof typeof Types;

interface NameAndDescription {
  /** Unique identifier for the field. */
  id: string;
  /** Field name, typically property name in object. */
  name?: string;
  /** JSON Schema description field */
  description?: string;
  /** Indicates whether this field is required. */
  isRequired?: boolean;
  /** JSON Schema title field */
  title?: string;
  /** @see https://docs.inkeep.com/visual-builder/structured-outputs/artifact-components#preview-fields */
  isPreview?: boolean;
}

export type EditableField =
  | FieldString
  | FieldNumber
  | FieldBoolean
  | FieldEnum
  | FieldArray
  | FieldObject;

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
  items: Exclude<EditableField, 'name' | 'isRequired'>;
}

interface FieldObject extends NameAndDescription {
  type: 'object';
  properties: EditableField[];
}

type FieldPatch = Partial<
  Pick<NameAndDescription, 'name' | 'description' | 'isRequired' | 'title' | 'isPreview'>
>;

const applyCommonMetadata = (schema: JSONSchemaWithPreview, field: NameAndDescription) => {
  const { hasInPreview } = jsonSchemaStore.getState();

  if (field.description) {
    schema.description = field.description;
  }
  if (field.title) {
    schema.title = field.title;
  }
  if (hasInPreview && field.isPreview) {
    schema.inPreview = true;
  }
  return schema;
};

const fieldsToJsonSchema = (field: EditableField | undefined): JSONSchemaWithPreview => {
  if (!field) {
    return { type: 'string' };
  }
  switch (field.type) {
    case 'object': {
      const properties: Record<string, JSONSchema7> = {};
      const required: string[] = [];

      for (const property of field.properties ?? []) {
        if (!property.name) continue;
        properties[property.name] = fieldsToJsonSchema(property);
        if (property.isRequired) {
          required.push(property.name);
        }
      }

      const schema: JSONSchemaWithPreview = {
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
      const schema: JSONSchemaWithPreview = {
        type: 'array',
        items,
      };
      applyCommonMetadata(schema, field);
      return schema;
    }
    case 'enum': {
      const schema: JSONSchemaWithPreview = {
        type: 'string',
        enum: field.values,
      };
      applyCommonMetadata(schema, field);
      return schema;
    }
    case 'number': {
      const schema: JSONSchemaWithPreview = { type: 'number' };
      applyCommonMetadata(schema, field);
      return schema;
    }
    case 'boolean': {
      const schema: JSONSchemaWithPreview = { type: 'boolean' };
      applyCommonMetadata(schema, field);
      return schema;
    }
    case 'string':
    default: {
      const schema: JSONSchemaWithPreview = { type: 'string' };
      applyCommonMetadata(schema, field);
      return schema;
    }
  }
};

function convertJsonSchemaToFields({
  schema,
  name,
  isRequired,
  id = ROOT_ID,
}: {
  schema: JSONSchemaWithPreview;
  name?: string;
  isRequired?: boolean;
  id?: string;
}): EditableField | undefined {
  const { hasInPreview } = jsonSchemaStore.getState();
  const base: NameAndDescription = {
    id,
    ...(name && { name }),
    ...(schema.description && { description: schema.description }),
    ...(schema.title && { title: schema.title }),
    ...(isRequired && { isRequired: true }),
    ...(hasInPreview && schema.inPreview && { isPreview: true }),
  };

  if (schema.type === 'object') {
    const requiredFields: string[] = Array.isArray(schema.required) ? schema.required : [];
    const requiredFieldsSet = new Set(requiredFields);

    const properties =
      schema && typeof schema.properties === 'object'
        ? Object.entries(schema.properties).reduce<EditableField[]>((acc, [propertyName, prop]) => {
            // TODO - to pass typecheck
            if (typeof prop === 'boolean') {
              return acc;
            }
            const child = convertJsonSchemaToFields({
              schema: prop,
              name: propertyName,
              isRequired: requiredFieldsSet.has(propertyName),
              id: `${id}.${propertyName}`,
            });
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
    let items: EditableField | undefined;
    const itemsId = `${id}.[]`;
    if (schema && typeof schema.items === 'object') {
      items = convertJsonSchemaToFields({
        // @ts-expect-error todo: should we support Array of items?
        schema: schema.items,
        id: itemsId,
      });
    }

    if (!items) {
      items = {
        id: itemsId,
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

const Types = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  enum: 'enum',
  array: 'array',
  object: 'object',
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

const parseFieldsFromJson = (value: string): EditableField[] => {
  if (!value.trim().length) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as JSONSchemaWithPreview;
    const result = convertJsonSchemaToFields({ schema: parsed });
    if (!result) {
      return [];
    }

    if (result.type === 'object') {
      return result.properties ?? [];
    }

    return [result];
  } catch {
    return [];
  }
};

const findFieldById = (fields: EditableField[], id: string): EditableField | undefined => {
  for (const field of fields) {
    const found = findFieldRecursively(field, id);
    if (found) {
      return found;
    }
  }
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
};

const createEditableField = ({ id, type }: { id: string; type: TypeValues }): EditableField => {
  switch (type) {
    case 'object':
      return { id, type: 'object', properties: [] };
    case 'array':
      return {
        id,
        type: 'array',
        items: createEditableField({
          type: 'string',
          id: `${id}.[]`,
        }),
      };
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
  const base = {
    id: field.id,
    name: field.name,
    description: field.description,
    isRequired: field.isRequired,
    title: field.title,
  };

  switch (type) {
    case 'object':
      return {
        ...base,
        type: 'object',
        properties: field.type === 'object' ? field.properties : [],
      };
    case 'array':
      return {
        ...base,
        type: 'array',
        items:
          field.type === 'array'
            ? field.items
            : createEditableField({
                type: 'string',
                id: `${base.id}.${nanoid()}`,
              }),
      };
    case 'enum':
      return {
        ...base,
        type: 'enum',
        values: field.type === 'enum' ? (field.values ?? []) : [],
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

interface JsonSchemaStateData {
  fields: EditableField[];
  hasInPreview: boolean;
}

interface JsonSchemaActions {
  setFields: (fields: EditableField[], hasInPreview?: boolean) => void;
  updateField: (id: string, patch: FieldPatch) => void;
  changeType: (id: string, type: TypeValues) => void;
  addChild: (parentId?: string) => void;
  removeField: (id: string) => void;
  updateEnumValues: (id: string, values: string[]) => void;
}

interface JsonSchemaState extends JsonSchemaStateData {
  actions: JsonSchemaActions;
}

const jsonSchemaState: StateCreator<JsonSchemaState> = (set) => ({
  fields: [],
  hasInPreview: false,
  actions: {
    setFields(fields, hasInPreview) {
      set({ fields, hasInPreview });
    },
    updateField(id, patch) {
      set((state) => {
        const [fields, changed] = updateEditableFields(state.fields, id, (candidate) => ({
          ...candidate,
          ...patch,
        }));
        return changed ? { fields } : state;
      });
    },
    changeType(id, type) {
      set((state) => {
        const [fields, changed] = updateEditableFields(state.fields, id, (candidate) =>
          changeEditableFieldType(candidate, type)
        );
        return changed ? { fields } : state;
      });
    },
    addChild(parentId = ROOT_ID) {
      set((state) => {
        const child = createEditableField({
          type: 'string',
          id: `${parentId}.${nanoid()}`,
        });
        if (parentId === ROOT_ID) {
          return { fields: [...state.fields, child] };
        }
        const [fields, changed] = addChildToEditableTree(state.fields, parentId, child);
        return changed ? { fields } : state;
      });
    },
    removeField(id) {
      set((state) => {
        const filtered = state.fields.filter((field) => field.id !== id);
        if (filtered.length !== state.fields.length) {
          return { fields: filtered };
        }
        const [fields, changed] = removeEditableFieldFromTree(state.fields, id);
        return changed ? { fields } : state;
      });
    },
    updateEnumValues(id, values) {
      set((state) => {
        const [fields, changed] = updateEditableFields(state.fields, id, (candidate) =>
          candidate.type === 'enum' ? { ...candidate, values } : candidate
        );
        return changed ? { fields } : state;
      });
    },
  },
});

const jsonSchemaStore = create<JsonSchemaState>()(devtools(jsonSchemaState));

/**
 * Actions are functions that update values in your store.
 * These are static and do not change between renders.
 *
 * @see https://tkdodo.eu/blog/working-with-zustand#separate-actions-from-state
 */
const useJsonSchemaActions = () => jsonSchemaStore((state) => state.actions);

/**
 * Select values from the store (excluding actions).
 *
 * We explicitly use `JsonSchemaStateData` instead of `JsonSchemaState`,
 * which includes actions, to encourage using `useJsonSchemaActions `
 * when accessing or calling actions.
 */
function useJsonSchemaStore<T>(selector: (state: JsonSchemaStateData) => T): T {
  return jsonSchemaStore(useShallow(selector));
}

export {
  Types,
  jsonSchemaStore,
  findFieldById,
  parseFieldsFromJson,
  convertJsonSchemaToFields,
  fieldsToJsonSchema,
  useJsonSchemaStore,
  useJsonSchemaActions,
  type TypeValues,
  type JsonSchemaStateData,
  type FieldObject,
};
