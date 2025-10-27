import {
  type ArrayFieldItemTemplateProps,
  type FormContextType,
  getTemplate,
  getUiOptions,
  type RJSFSchema,
  type StrictRJSFSchema,
} from '@rjsf/utils';

/** The `ArrayFieldItemTemplate` component is the template used to render an items of an array.
 *
 * @param props - The `ArrayFieldItemTemplateProps` props for the component
 */
export default function ArrayFieldItemTemplate<
  T = any,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = any,
>(props: ArrayFieldItemTemplateProps<T, S, F>) {
  const { children, buttonsProps, hasToolbar, uiSchema, registry } = props;
  const uiOptions = getUiOptions<T, S, F>(uiSchema);
  const ArrayFieldItemButtonsTemplate = getTemplate<'ArrayFieldItemButtonsTemplate', T, S, F>(
    'ArrayFieldItemButtonsTemplate',
    registry,
    uiOptions
  );
  return (
    <div className="mb-2 flex flex-row flex-wrap items-center gap-2">
      <div className="grow shrink">{children}</div>
      {hasToolbar && (
        <div className="flex gap-2">
          <ArrayFieldItemButtonsTemplate {...buttonsProps} />
        </div>
      )}
    </div>
  );
}
