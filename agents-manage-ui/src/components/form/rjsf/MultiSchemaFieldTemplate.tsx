import type {
  FormContextType,
  MultiSchemaFieldTemplateProps,
  RJSFSchema,
  StrictRJSFSchema,
} from '@rjsf/utils';

export default function MultiSchemaFieldTemplate<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>({ selector, optionSchemaField }: MultiSchemaFieldTemplateProps<T, S, F>) {
  return (
    <div className="p-4 border rounded-md bg-background shadow-sm">
      <div className="mb-4">{selector}</div>
      {optionSchemaField}
    </div>
  );
}
