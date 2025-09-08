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

  useEffect(() => {
    if (!isEditing && nameValue && !(form.formState.dirtyFields as any)[idField]) {
      const generatedId = generateId(nameValue);
      form.setValue(idField as any, generatedId as any, { shouldValidate: true });
    }
  }, [nameValue, form, idField, isEditing]);
}
