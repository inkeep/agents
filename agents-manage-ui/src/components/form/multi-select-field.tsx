'use client';

import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { ComponentDropdown } from '@/components/agent/sidepane/nodes/component-selector/component-dropdown';
import { SelectedComponents } from '@/components/agent/sidepane/nodes/component-selector/selected-components';
import { FormFieldWrapper } from './form-field-wrapper';
import type { SelectOption } from './generic-select';

interface MultiSelectFieldProps<FV extends FieldValues, TV extends FieldValues = FieldValues> {
  control: Control<FV, unknown, TV>;
  name: FieldPath<FV>;
  label: string;
  options: SelectOption[];
  placeholder?: string;
  commandInputPlaceholder?: string;
}

export function MultiSelectField<FV extends FieldValues, TV extends FieldValues = FieldValues>({
  control,
  name,
  label,
  options,
  placeholder = 'Select...',
  commandInputPlaceholder = 'Search...',
}: MultiSelectFieldProps<FV, TV>) {
  const componentLookup = Object.fromEntries(
    options.map((o) => [o.value, { id: o.value, name: o.label }])
  );

  return (
    <FormFieldWrapper control={control} name={name} label={label}>
      {(field) => {
        const selectedIds: string[] = field.value || [];

        const handleToggle = (id: string) => {
          const newSelection = selectedIds.includes(id)
            ? selectedIds.filter((s) => s !== id)
            : [...selectedIds, id];
          field.onChange(newSelection);
        };

        return (
          <div className="flex flex-col gap-2">
            {selectedIds.length > 0 && (
              <SelectedComponents
                selectedComponents={selectedIds}
                componentLookup={componentLookup}
                handleToggle={handleToggle}
              />
            )}
            <ComponentDropdown
              selectedComponents={selectedIds}
              handleToggle={handleToggle}
              availableComponents={Object.values(componentLookup)}
              placeholder={placeholder}
              commandInputPlaceholder={commandInputPlaceholder}
            />
          </div>
        );
      }}
    </FormFieldWrapper>
  );
}
