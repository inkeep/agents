import type { JSONSchema7 } from 'json-schema';
import { createStore, type StoreApi } from 'zustand/vanilla';

const applyCommonMetadata = (schema: JSONSchema7, field: NameAndDescription) => {
  if (field.description) {
    schema.description = field.description;
  }
  if (field.title) {
    schema.title = field.title;
  }
  return schema;
};

const fieldsToJsonSchema = (field: AllFields | undefined): JSONSchema7 => {
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

function convertJsonSchemaToFields(
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

const ROOT_ID = '__root__';

let fieldIdCounter = 0;

const createFieldId = () => `field-${++fieldIdCounter}`;

const resetFieldIdCounter = () => {
  fieldIdCounter = 0;
};

const Types = {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  enum: 'enum',
  array: 'array',
  object: 'object',
};

type TypeValues = keyof typeof Types;

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

const applyPatchToField = (field: EditableField, patch: FieldPatch): EditableField => ({
  ...field,
  ...patch,
});

const addIdsToFields = (fields: AllFields[]): EditableField[] => fields.map(addIdsToField);

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
        items: field.type === 'array' ? field.items : createEditableField('string'),
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
  metadata: ParsedSchemaResult['metadata'];
}

interface JsonSchemaActions {
  reset: (data: ParsedSchemaResult) => void;
  updateField: (id: string, patch: FieldPatch) => void;
  changeType: (id: string, type: TypeValues) => void;
  addChild: (parentId: string) => void;
  removeField: (id: string) => void;
  updateEnumValues: (id: string, values: string[]) => void;
}

interface JsonSchemaState extends JsonSchemaStateData {
  actions: JsonSchemaActions;
}

const createJsonSchemaBuilderStore = (initial: ParsedSchemaResult) => {
  resetFieldIdCounter();
  const initialEditable = addIdsToFields(initial.fields);
  return createStore<JsonSchemaState>((set) => ({
    fields: initialEditable,
    metadata: { ...initial.metadata },
    actions: {
      reset(data) {
        resetFieldIdCounter();
        set({ fields: addIdsToFields(data.fields), metadata: { ...data.metadata } });
      },
      updateField(id, patch) {
        set((state) => {
          const [fields, changed] = updateEditableFields(state.fields, id, (candidate) =>
            applyPatchToField(candidate, patch)
          );
          return changed ? { fields } : {};
        });
      },
      changeType(id, type) {
        set((state) => {
          const [fields, changed] = updateEditableFields(state.fields, id, (candidate) =>
            changeEditableFieldType(candidate, type)
          );
          return changed ? { fields } : {};
        });
      },
      addChild(parentId) {
        set((state) => {
          const child = createEditableField('string');
          if (parentId === ROOT_ID) {
            return { fields: [...state.fields, child] };
          }
          const [fields, changed] = addChildToEditableTree(state.fields, parentId, child);
          return changed ? { fields } : {};
        });
      },
      removeField(id) {
        set((state) => {
          const filtered = state.fields.filter((field) => field.id !== id);
          if (filtered.length !== state.fields.length) {
            return { fields: filtered };
          }
          const [fields, changed] = removeEditableFieldFromTree(state.fields, id);
          return changed ? { fields } : {};
        });
      },
      updateEnumValues(id, values) {
        set((state) => {
          const [fields, changed] = updateEditableFields(state.fields, id, (candidate) =>
            candidate.type === 'enum' ? { ...candidate, values } : candidate
          );
          return changed ? { fields } : {};
        });
      },
    },
  }));
};

export {
  Types,
  ROOT_ID,
  createJsonSchemaBuilderStore,
  stripIdsFromFields,
  findFieldById,
  parseFieldsFromJson,
  convertJsonSchemaToFields,
  fieldsToJsonSchema,
  type TypeValues,
  type JsonSchemaState,
  type FieldObject,
};
