'use client';

import type { OptionType } from '@/components/ui/combobox';
import { Combobox } from '@/components/ui/combobox';
import { ORIGIN_LABELS, type TraceOrigin } from '@/hooks/use-traces-query-state';
import { FilterTriggerComponent } from './filter-trigger';

interface OriginFilterProps {
  onSelect: (value?: TraceOrigin) => void;
  selectedValue: TraceOrigin | undefined;
}

const ORIGIN_OPTIONS: OptionType[] = (Object.keys(ORIGIN_LABELS) as TraceOrigin[]).map((value) => ({
  value,
  label: ORIGIN_LABELS[value],
  searchBy: ORIGIN_LABELS[value],
}));

export const OriginFilter = ({ onSelect, selectedValue }: OriginFilterProps) => {
  return (
    <Combobox
      defaultValue={selectedValue}
      notFoundMessage="No origins found."
      onSelect={(value) => {
        onSelect(value ? (value as TraceOrigin) : undefined);
      }}
      options={ORIGIN_OPTIONS}
      TriggerComponent={
        <FilterTriggerComponent
          filterLabel={selectedValue ? 'Origin' : 'All origins'}
          isRemovable={true}
          onDeleteFilter={() => {
            onSelect(undefined);
          }}
          multipleCheckboxValues={selectedValue ? [selectedValue] : []}
          options={ORIGIN_OPTIONS}
        />
      }
    />
  );
};
