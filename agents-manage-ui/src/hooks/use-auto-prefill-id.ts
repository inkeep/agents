import { useEffect } from 'react';
import { type FieldPath, type FieldValues, type UseFormReturn, useWatch } from 'react-hook-form';
import { generateIdFromName } from '@/lib/utils/generate-id';

interface UseAutoPrefillIdOptions<
  FV extends FieldValues,
  TV = FV,
  NF = FieldPath<FV>,
  IF = FieldPath<FV>,
> {
  form: UseFormReturn<FV, any, TV>;
  nameField: NF;
  idField: IF;
  isEditing?: boolean;
}

/**
 * Custom hook to auto-prefill an ID field based on a name field
 * Only prefills when creating new items (not editing) and when the ID field hasn't been manually edited
 */
export function useAutoPrefillId<
  FV extends FieldValues,
  TV extends FieldValues = FV,
  NF extends FieldPath<FV> = FieldPath<FV>,
  IF extends FieldPath<FV> = FieldPath<FV>,
>({ form, nameField, idField, isEditing = false }: UseAutoPrefillIdOptions<FV, TV, NF, IF>) {
  const nameValue = useWatch({
    control: form.control,
    name: nameField,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: we don't want to re-run this effect when the isIdFieldModified changes since that means the user has manually edited the ID field
  useEffect(() => {
    const isIdFieldModified = form.getFieldState(idField, form.formState).isDirty;

    if (!isEditing && nameValue && !isIdFieldModified) {
      const generatedId = generateIdFromName(nameValue);
      form.setValue(idField, generatedId as any, { shouldValidate: true });
    }
  }, [nameValue, idField, isEditing]);
}
