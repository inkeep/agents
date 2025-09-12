import { useEffect, useRef } from 'react';

/**
 * Custom hook that creates a ref for text input elements and automatically positions
 * the cursor at the end of the text when the component mounts.
 *
 * Works with any element that has setSelectionRange method (input, textarea, etc.)
 * and a value property.
 *
 * Useful for expanded/fullscreen text editing scenarios where you want
 * the user to continue editing from where they left off.
 *
 * @example
 * // For textarea elements
 * const textareaRef = useCursorToEnd<HTMLTextAreaElement>()
 * <textarea ref={textareaRef} />
 *
 * @example
 * // For input elements
 * const inputRef = useCursorToEnd<HTMLInputElement>()
 * <input ref={inputRef} />
 *
 * @example
 * // Generic usage (auto-inferred type)
 * const ref = useCursorToEnd()
 * <textarea ref={ref} />
 *
 * @returns A ref to attach to the text input element
 */
export function useCursorToEnd<
  T extends HTMLInputElement | HTMLTextAreaElement = HTMLTextAreaElement,
>() {
  const inputRef = useRef<T>(null);

  useEffect(() => {
    if (inputRef.current && typeof inputRef.current.setSelectionRange === 'function') {
      const element = inputRef.current;
      const textLength = element.value?.length || 0;
      try {
        element.setSelectionRange(textLength, textLength);
      } catch (error) {
        console.error(error);
      }
    }
  }, []);

  return inputRef;
}
