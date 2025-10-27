import { withTheme } from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import type { UiSchema } from '@rjsf/utils';
import type { RJSFSchema } from '@rjsf/utils';
import { Theme as ShadcnTheme } from '@rjsf/shadcn';
import type { SimpleJsonSchema } from './json-schema-simple-utils';
import { createEmptySimpleJsonSchema } from './json-schema-simple-utils';

const Form = withTheme(ShadcnTheme);

const SIMPLE_SCHEMA: RJSFSchema = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      title: 'Name',
    },
    description: {
      type: 'string',
      title: 'Description',
    },
    properties: {
      type: 'array',
      title: 'Properties',
      items: {
        $ref: '#/$defs/property',
      },
    },
  },
  $defs: {
    property: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          title: 'Name',
        },
        title: {
          type: 'string',
          title: 'Label',
        },
        description: {
          type: 'string',
          title: 'Description',
        },
        type: {
          type: 'string',
          title: 'Type',
          enum: ['string', 'number', 'integer', 'boolean', 'object', 'array'],
          default: 'string',
        },
        required: {
          type: 'boolean',
          title: 'Required',
          default: true,
        },
        properties: {
          type: 'array',
          title: 'Nested Properties',
          items: {
            $ref: '#/$defs/property',
          },
        },
        items: {
          title: 'Array Item Definition',
          $ref: '#/$defs/property',
        },
      },
      required: ['name', 'type'],
      default: {
        type: 'string',
        required: true,
      },
    },
  },
};

const SIMPLE_UI_SCHEMA: UiSchema = {
  properties: {
    'ui:options': {
      orderable: true,
    },
    items: {
      'ui:options': {
        orderable: true,
      },
    },
  },
  description: {
    'ui:widget': 'textarea',
    'ui:options': {
      rows: 2,
    },
  },
  'ui:submitButtonOptions': {
    norender: true,
  },
};

const buildTemplates = () => {
  const baseTemplates = ShadcnTheme?.templates ?? {};
  const baseButtonTemplates = baseTemplates.ButtonTemplates ?? {};

  return {
    ...baseTemplates,
    ButtonTemplates: {
      ...baseButtonTemplates,
      SubmitButton: () => null,
    },
  };
};

const CUSTOM_TEMPLATES = buildTemplates();

interface JsonSchemaSimpleEditorProps {
  value: SimpleJsonSchema | undefined;
  onChange: (schema: SimpleJsonSchema) => void;
  disabled?: boolean;
  readOnly?: boolean;
}

function buildForm(obj: RJSFSchema) {
  switch (obj.type) {
    case 'object': {
      return <div>object</div>;
    }
  }
}

const MY_SCHEMA: RJSFSchema = {
  type: 'array',
  items: {
    type: '',
  },
  $defs: {
    name: {
      type: 'string',
      title: 'Name of the field',
    },
    description: {
      type: 'string',
      title: 'Description of the field',
    },
    // === === === === === ===
    type: {
      type: 'string',
      enum: ['string', 'number', 'boolean', 'enum', 'object', 'array'],
    },
    string: {
      type: 'object',
      properties: {
        type: {
          $ref: '#/$defs/type',
        },
        name: {
          $ref: '#/$defs/name',
        },
        description: {
          $ref: '#/$defs/description',
        },
      },
    },
    number: {
      type: 'object',
      properties: {
        type: {
          $ref: '#/$defs/type',
        },
        name: {
          $ref: '#/$defs/name',
        },
        description: {
          $ref: '#/$defs/description',
        },
      },
    },
    boolean: {
      type: 'object',
      properties: {
        type: {
          $ref: '#/$defs/type',
        },
        name: {
          $ref: '#/$defs/name',
        },
        description: {
          $ref: '#/$defs/description',
        },
      },
    },
  },
};

export function JsonSchemaSimpleEditor({
  value,
  onChange,
  disabled,
  readOnly,
}: JsonSchemaSimpleEditorProps) {
  const formData = value ?? createEmptySimpleJsonSchema();

  return (
    <Form<SimpleJsonSchema>
      schema={SIMPLE_SCHEMA}
      uiSchema={SIMPLE_UI_SCHEMA}
      templates={CUSTOM_TEMPLATES}
      formData={formData}
      validator={validator}
      liveValidate
      noHtml5Validate
      showErrorList={false}
      disabled={disabled}
      readonly={readOnly}
      focusOnFirstError={false}
      onChange={(event) => {
        // onChange(event.formData ?? createEmptySimpleJsonSchema());
      }}
    />
  );
}
