import { withTheme } from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import { englishStringTranslator, TranslatableString, type UiSchema } from '@rjsf/utils';
import type { RJSFSchema } from '@rjsf/utils';
import { Theme as ShadcnTheme } from '@rjsf/shadcn';
import type { SimpleJsonSchema } from './json-schema-simple-utils';
import { createEmptySimpleJsonSchema } from './json-schema-simple-utils';
import ArrayFieldItemTemplate from './ArrayFieldItemTemplate';
import FieldTemplate from './FieldTemplate';

const Form = withTheme(ShadcnTheme);

const buildTemplates = () => {
  const baseTemplates = ShadcnTheme.templates;

  return {
    ...baseTemplates,
    FieldTemplate,
    ArrayFieldItemTemplate,
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

const SIMPLE_SCHEMA: RJSFSchema = {
  type: 'array',
  items: {
    oneOf: [{ $ref: '#/$defs/string' }, { $ref: '#/$defs/number' }, { $ref: '#/$defs/boolean' }],
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
      title: 'STR',
      properties: {
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
      title: 'NUM',
      properties: {
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
      title: 'BOOL',
      properties: {
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

const SIMPLE_UI_SCHEMA: UiSchema = {
  'ui:globalOptions': {
    label: false,
    orderable: false,
  },
  items: {
    'ui:order': ['description', '*'],
    name: {
      'ui:placeholder': 'Property name',
    },
    description: {
      'ui:placeholder': 'Add description',
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
      // formData={value}
      // tagName="div"
      validator={validator}
      // liveValidate
      noHtml5Validate
      showErrorList={false}
      disabled={disabled}
      readonly={readOnly}
      focusOnFirstError={false}
      translateString={(stringToTranslate, params) => {
        switch (stringToTranslate) {
          case TranslatableString.AddItemButton: {
            return 'Add property';
          }
        }
        return englishStringTranslator(stringToTranslate, params); // Fallback to the default english
      }}
      onChange={(event) => {
        // onChange(event.formData ?? createEmptySimpleJsonSchema());
      }}
    />
  );
}
