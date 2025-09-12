'use client';

import { useEffect, useState, useRef } from 'react';
import { ExpandableJsonEditor } from './expandable-json-editor';
import { formatJsonField } from '@/lib/utils';

interface ObjectJsonEditorProps {
  name: string;
  value: Record<string, any> | undefined;
  onChange: (value: Record<string, any> | undefined) => void;
  className?: string;
  label?: string;
  placeholder?: string;
}

/**
 * A specialized version of ExpandableJsonEditor that works with objects instead of strings.
 * This prevents cursor jumping issues by managing string conversion internally.
 *
 * The component:
 * 1. Takes object values and returns object values (React Hook Form compatible)
 * 2. Internally manages string state during editing
 * 3. Only calls onChange with parsed objects when JSON is valid
 * 4. Preserves cursor position by avoiding unnecessary re-parsing during typing
 */
export function ObjectJsonEditor({
  name,
  value,
  onChange,
  className,
  label,
  placeholder,
}: ObjectJsonEditorProps) {
  // Local string state to preserve user input during typing
  const [jsonString, setJsonString] = useState(() => formatJsonField(value));

  // Ref to track the current object value to avoid loops
  const currentValueRef = useRef(value);
  currentValueRef.current = value;

  // Sync with external value changes (but not during user typing)
  useEffect(() => {
    // Only update if the external value actually changed and differs from current string
    const externalStringified = formatJsonField(value);
    if (externalStringified !== jsonString) {
      setJsonString(externalStringified);
    }
  }, [value, jsonString]);

  const handleChange = (newJsonString: string) => {
    // Always update the local string state immediately (preserves cursor)
    setJsonString(newJsonString);

    // Try to parse and update the object value
    if (!newJsonString?.trim()) {
      // Empty string should result in undefined
      if (currentValueRef.current !== undefined) {
        onChange(undefined);
      }
      return;
    }

    try {
      const parsed = JSON.parse(newJsonString);
      // Only call onChange if the parsed value is actually different
      if (JSON.stringify(parsed) !== JSON.stringify(currentValueRef.current)) {
        onChange(parsed);
      }
    } catch {
      // Invalid JSON - don't update the object value, just preserve the string
      // This allows users to type through invalid states without cursor jumping
    }
  };

  return (
    <ExpandableJsonEditor
      name={name}
      label={label}
      value={jsonString}
      onChange={handleChange}
      className={className}
      placeholder={placeholder}
    />
  );
}
