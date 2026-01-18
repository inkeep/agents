import { useEffect, useRef } from 'react';
import { generateIdFromName } from '@/lib/utils/generate-id';

interface UseAutoPrefillIdZustandOptions {
  nameValue: string | undefined;
  idValue: string | undefined;
  onIdChange: (id: string) => void;
  isEditing?: boolean;
}

/**
 * Custom hook to auto-prefill an ID field based on a name field for Zustand state
 * Only prefills when creating new items (not editing) and when the ID field hasn't been manually edited
 */
export function useAutoPrefillIdZustand({
  nameValue,
  idValue,
  onIdChange,
  isEditing = false,
}: UseAutoPrefillIdZustandOptions) {
  // Track if user has manually edited the ID field
  const hasManuallyEditedId = useRef(false);
  const lastGeneratedId = useRef('');
  const onIdChangeRef = useRef(onIdChange);
  const currentIdValue = useRef(idValue);

  // Keep refs up to date
  useEffect(() => {
    onIdChangeRef.current = onIdChange;
    currentIdValue.current = idValue;
  }, [onIdChange, idValue]);

  // Reset manual edit tracking when switching between agent
  useEffect(() => {
    if (isEditing) {
      hasManuallyEditedId.current = false;
      lastGeneratedId.current = '';
    }
  }, [isEditing]);

  // Track manual edits to ID field
  useEffect(() => {
    if (!isEditing) {
      if (!idValue) {
        // If ID field is empty, reset manual edit flag to allow auto-generation
        hasManuallyEditedId.current = false;
        lastGeneratedId.current = '';
      } else if (idValue !== lastGeneratedId.current) {
        // Consider it a manual edit if user typed something different from our generated value
        // This includes typing into an empty field (when lastGeneratedId is empty)
        hasManuallyEditedId.current = true;
      }
    }
  }, [idValue, isEditing]);

  // Auto-prefill ID based on name field
  useEffect(() => {
    if (!isEditing && nameValue && !hasManuallyEditedId.current) {
      const generatedId = generateIdFromName(nameValue);

      // Only update if the generated ID is different from current ID
      if (generatedId !== currentIdValue.current) {
        lastGeneratedId.current = generatedId;
        onIdChangeRef.current(generatedId);
      }
    }
  }, [nameValue, isEditing]);
}
