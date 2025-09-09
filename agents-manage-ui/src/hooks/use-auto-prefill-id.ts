import { useEffect } from 'react';
import { type UseFormReturn, type FieldValues, useWatch } from 'react-hook-form';
import { generateId } from '@/lib/utils/generate-id';

interface UseAutoPrefillIdOptions<T extends FieldValues> {
  form: UseFormReturn<T>;
  nameField: keyof T;
  idField: keyof T;
  isEditing?: boolean;
}

/**
 * Custom hook to auto-prefill an ID field based on a name field
 * Only prefills when creating new items (not editing) and when the ID field hasn't been manually edited
 */
export function useAutoPrefillId<T extends FieldValues>({
  form,
  nameField,
  idField,
  isEditing = false,
}: UseAutoPrefillIdOptions<T>) {
  const nameValue = useWatch({
    control: form.control,
    name: nameField as any,
  });

  const isIdFieldModified = (form.formState.dirtyFields as any)[idField];

  // biome-ignore lint/correctness/useExhaustiveDependencies: we don't want to re-run this effect when the isIdFieldModified changes since that means the user has manually edited the ID field
  useEffect(() => {
    if (!isEditing && nameValue && !isIdFieldModified) {
      const generatedId = generateId(nameValue);
      form.setValue(idField as any, generatedId as any, { shouldValidate: true });
    }
  }, [nameValue, idField, isEditing]);
}
