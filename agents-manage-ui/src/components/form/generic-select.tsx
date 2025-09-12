'use client';

import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormFieldWrapper } from './form-field-wrapper';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface GenericSelectProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  placeholder?: string;
  options: SelectOption[];
  disabled?: boolean;
  selectTriggerClassName?: string;
  isRequired?: boolean;
}

export function GenericSelect<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  options,
  disabled = false,
  selectTriggerClassName,
  isRequired = false,
}: GenericSelectProps<T>) {
  return (
    <FormFieldWrapper control={control} name={name} label={label} isRequired={isRequired}>
      {(field) => (
        <Select onValueChange={field.onChange} defaultValue={field.value} disabled={disabled}>
          <SelectTrigger disabled={disabled} className={selectTriggerClassName}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </FormFieldWrapper>
  );
}
