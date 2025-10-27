'use client';

import { useEffect, useState } from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { FormFieldWrapper } from './form-field-wrapper';
import { StandaloneJsonEditor } from '../editors/standalone-json-editor';
import { JsonSchemaSimpleEditor } from './json-schema-simple-editor';
import {
  convertJsonSchemaToSimple,
  convertSimpleToJsonSchema,
  createEmptySimpleJsonSchema,
  isSimpleJsonSchemaEmpty,
  type SimpleJsonSchema,
} from './json-schema-simple-utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface JsonSchemaInputProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  description?: string;
  readOnly?: boolean;
  isRequired?: boolean;
}

export function JsonSchemaInput<T extends FieldValues>({
  control,
  name,
  label = 'JSON Schema',
  placeholder,
  disabled,
  description,
  readOnly,
  isRequired = false,
}: JsonSchemaInputProps<T>) {
  const [activeTab, setActiveTab] = useState<'simple' | 'advanced'>('simple');
  return (
    <FormFieldWrapper
      control={control}
      name={name}
      label={label}
      description={description}
      isRequired={isRequired}
    >
      {(field) => (
        <Tabs
          defaultValue="simple"
          value={activeTab}
          onValueChange={(value) => {
            setActiveTab(value as 'simple' | 'advanced');
          }}
        >
          <TabsList className="absolute -top-2 right-0 h-auto space-x-1">
            <TabsTrigger value="simple" className="py-0.5">
              Simple
            </TabsTrigger>
            <TabsTrigger value="advanced" className="py-0.5">
              Advanced
            </TabsTrigger>
          </TabsList>
          <TabsContent value="simple">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Value</TableHead>
                </TableRow>
              </TableHeader>
            </Table>
            <br />
            <SimpleTabContent
              fieldValue={field.value}
              onFieldChange={field.onChange}
              disabled={disabled}
              readOnly={readOnly}
              switchToAdvanced={() => setActiveTab('advanced')}
            />
          </TabsContent>
          <TabsContent value="advanced">
            <StandaloneJsonEditor
              placeholder={placeholder}
              {...field}
              value={field.value || ''} // can be `null`
              onChange={field.onChange}
              readOnly={readOnly}
              disabled={disabled}
            />
          </TabsContent>
        </Tabs>
      )}
    </FormFieldWrapper>
  );
}

interface SimpleTabContentProps {
  fieldValue: unknown;
  onFieldChange: (value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  switchToAdvanced: () => void;
}

const SimpleTabContent = ({
  fieldValue,
  onFieldChange,
  disabled,
  readOnly,
  switchToAdvanced,
}: SimpleTabContentProps) => {
  const [simpleState, setSimpleState] = useState<SimpleJsonSchema>(() =>
    createEmptySimpleJsonSchema()
  );
  const [simpleError, setSimpleError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!fieldValue || typeof fieldValue !== 'string' || fieldValue.trim().length === 0) {
      setSimpleState(createEmptySimpleJsonSchema());
      setSimpleError(undefined);
      return;
    }

    try {
      const json = JSON.parse(fieldValue);
      const result = convertJsonSchemaToSimple(json);
      setSimpleState(result.simpleSchema);
      setSimpleError(result.error);
    } catch (error) {
      setSimpleState(createEmptySimpleJsonSchema());
      setSimpleError(
        error instanceof Error
          ? `Unable to parse JSON schema. ${error.message}`
          : 'Unable to parse JSON schema.'
      );
    }
  }, [fieldValue]);

  const handleSimpleChange = (updated: SimpleJsonSchema) => {
    setSimpleState(updated);

    const jsonSchema = convertSimpleToJsonSchema(updated);

    if (!jsonSchema || isSimpleJsonSchemaEmpty(updated)) {
      onFieldChange('');
      return;
    }

    onFieldChange(JSON.stringify(jsonSchema, null, 2));
  };

  return (
    <div className="space-y-4">
      {simpleError && (
        <Alert variant="warning">
          <AlertTitle>Some schema features require Advanced mode</AlertTitle>
          <AlertDescription>
            {simpleError}{' '}
            <button
              className="font-medium underline underline-offset-4"
              type="button"
              onClick={switchToAdvanced}
            >
              Open Advanced editor
            </button>
            .
          </AlertDescription>
        </Alert>
      )}
      <JsonSchemaSimpleEditor
        value={simpleState}
        onChange={handleSimpleChange}
        disabled={disabled}
        readOnly={readOnly}
      />
    </div>
  );
};
