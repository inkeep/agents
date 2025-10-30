import { withTheme } from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import { englishStringTranslator, TranslatableString, type UiSchema } from '@rjsf/utils';
import type { RJSFSchema } from '@rjsf/utils';
import { Theme as ShadcnTheme } from '@rjsf/shadcn';
import type { SimpleJsonSchema } from './json-schema-simple-utils';
import { createEmptySimpleJsonSchema } from './json-schema-simple-utils';
import { ArrayFieldItemTemplate } from './rjsf/ArrayFieldItemTemplate';
import { MultiSchemaFieldTemplate } from './rjsf/MultiSchemaFieldTemplate';
import { BaseInputTemplate } from './rjsf/BaseInputTemplate';
import { ObjectFieldTemplate } from './rjsf/ObjectFieldTemplate';

const Form = withTheme(ShadcnTheme);

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
  title: 'properties',
  items: {
    oneOf: [
      { $ref: '#/$defs/string' },
      { $ref: '#/$defs/number' },
      { $ref: '#/$defs/boolean' },
      { $ref: '#/$defs/enum' },
    ],
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
      title: 'string',
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
      title: 'number',
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
      title: 'boolean',
      properties: {
        name: {
          $ref: '#/$defs/name',
        },
        description: {
          $ref: '#/$defs/description',
        },
      },
    },
    enum: {
      type: 'object',
      title: 'enum',
      properties: {
        name: {
          $ref: '#/$defs/name',
        },
        description: {
          $ref: '#/$defs/description',
        },
        multiSelect: {
          type: 'array',
          items: {
            type: 'string',
            // enum: ['foo', 'bar'],
          },
          uniqueItems: true,
          minItems: 1,
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
    name: {
      'ui:placeholder': 'Property name',
    },
    description: {
      'ui:placeholder': 'Add description',
    },
    multiSelect: {
      'ui:widget': 'select',
      'ui:options': {
        multiple: true,
      },
      'ui:help': 'Select 2-3 frameworks',
      'ui:placeholder': 'Select frameworks (required)',
    },
  },
};

export function JsonSchemaSimpleEditor({
  value,
  onChange,
  disabled,
  readOnly,
}: JsonSchemaSimpleEditorProps) {
  // const formData = value ?? createEmptySimpleJsonSchema();
  // console.log({ formData, value });

  return (
    <Form<SimpleJsonSchema>
      schema={SIMPLE_SCHEMA}
      uiSchema={SIMPLE_UI_SCHEMA}
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
