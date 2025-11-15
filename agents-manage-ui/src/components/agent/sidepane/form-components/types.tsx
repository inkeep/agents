import type { ChangeEvent } from 'react';

export interface BaseFieldProps {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange?: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  placeholder?: string;
  error?: string;
  className?: string;
  description?: string;
  tooltip?: string;
  isRequired?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
}
