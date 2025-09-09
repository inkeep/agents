import { ChevronDown, type LucideIcon, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { OptionType } from '@/components/ui/combobox';
import { PopoverTrigger } from '@/components/ui/popover';

interface FilterTriggerComponentProps {
  Icon?: LucideIcon;
  options: OptionType[];
  filterLabel: string;
  pluralFilterLabel?: string;
  multipleCheckboxValues: string[];
  onDeleteFilter: () => void;
  disabled?: boolean;
  isRemovable?: boolean;
  hideFilterLabelWhenSelected?: boolean;
}

export function FilterTriggerComponent({
  Icon,
  options,
  filterLabel,
  pluralFilterLabel,
  multipleCheckboxValues,
  onDeleteFilter,
  disabled,
  isRemovable = true,
  hideFilterLabelWhenSelected = false,
}: FilterTriggerComponentProps) {
  const countMultipleFilterValues = multipleCheckboxValues.length;
  const isShowSelectedOptions = !!countMultipleFilterValues;

  const firstSelectedOptionValue = countMultipleFilterValues && multipleCheckboxValues[0];
  const firstSelectedOptionLabel =
    options.find((option) => option.value === firstSelectedOptionValue)?.label ||
    firstSelectedOptionValue;

  const isShowOneSelectedOption = countMultipleFilterValues === 1;

  return (
    <div className="flex items-center max-w-full">
      <PopoverTrigger asChild>
        <Button
          className={`flex items-center gap-2 justify-between focus:ring-0 ${isShowSelectedOptions && isRemovable && 'rounded-tr-none rounded-br-none '}  max-w-full min-w-0`}
          disabled={disabled}
          size="sm"
          variant="gray-outline"
        >
          {hideFilterLabelWhenSelected && isShowSelectedOptions ? null : (
            <div className="flex items-center gap-2">
              {Icon && <Icon className="h-4 w-4 text-gray-400 dark:text-white/50" />}
              {filterLabel}
            </div>
          )}
          {isShowSelectedOptions &&
            (isShowOneSelectedOption ? (
              <div className="flex items-center gap-2 truncate">
                {!hideFilterLabelWhenSelected && (
                  <p className="text-gray-400 dark:text-white/50">is</p>
                )}
                {firstSelectedOptionLabel}
              </div>
            ) : (
              <div className="flex items-center gap-2 truncate">
                {Icon && <Icon className="h-4 w-4 text-gray-400 dark:text-white/50" />}
                <p className="text-gray-500">
                  {!hideFilterLabelWhenSelected && (
                    <p className="text-gray-400 dark:text-white/50">is any of</p>
                  )}
                  {countMultipleFilterValues} {pluralFilterLabel || filterLabel}
                </p>
              </div>
            ))}
          <ChevronDown
            className="mt-[2.5px] text-gray-400 dark:text-white/50"
            height={14}
            width={14}
          />
        </Button>
      </PopoverTrigger>
      {isShowSelectedOptions && isRemovable && (
        <Button
          className="flex items-center gap-2 justify-between h-[32px] !p-2 border-[1px] border-solid border-l-0 rounded-tl-none rounded-bl-none bg-background focus:ring-0"
          onClick={onDeleteFilter}
          variant="ghost"
        >
          <span className="sr-only">remove filter</span>
          <X className="text-gray-400 dark:text-white/50" />
        </Button>
      )}
    </div>
  );
}
