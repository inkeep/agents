'use client';

import { format } from 'date-fns';
import { CalendarIcon, Check } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import type { SelectOption } from '@/components/form/generic-select';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useDisclosure } from '@/hooks/use-disclosure';
import type { TimeRange } from '@/hooks/use-traces-query-state';
import { cn } from '@/lib/utils';
import { FilterTriggerComponent } from './filter-trigger';

interface DatePickerWithPresetsProps {
  label: string;
  value?: TimeRange | { from: string; to: string } | undefined;
  onAdd: (value: TimeRange) => void;
  onRemove: () => void;
  disabled?: boolean;
  options?: SelectOption[];
  setCustomDateRange: (start: string, end: string) => void;
  /**
   * When true, shows the calendar directly without the presets menu.
   * Uses a simpler button trigger instead of the filter chip style.
   */
  showCalendarDirectly?: boolean;
  /**
   * Placeholder text when no date is selected.
   * Only used when showCalendarDirectly is true.
   */
  placeholder?: string;
}

export const CUSTOM = 'custom';

export function DatePickerWithPresets({
  onAdd,
  onRemove,
  value,
  options = [],
  disabled,
  label,
  setCustomDateRange,
  showCalendarDirectly = false,
  placeholder = 'Select date range',
}: DatePickerWithPresetsProps) {
  const [showCalendar, setShowCalendar] = useState(showCalendarDirectly);
  const { isOpen, onClose, onToggle, onOpen } = useDisclosure();

  const commandRef = useRef<HTMLDivElement>(null);

  const handleChangeOnOpen = (open: boolean) => {
    if (open) {
      onOpen();
      if (showCalendarDirectly) {
        setShowCalendar(true);
      }
    } else {
      onClose();
      if (showCalendarDirectly) {
        setShowCalendar(true);
      } else {
        setShowCalendar(false);
      }
    }
  };

  const presetValue = options.find((option) => option.value === value);

  // Memoize only the expensive date formatting operations
  const dateComputations = useMemo(() => {
    if (!value || typeof value !== 'object') {
      return { initialDate: undefined, dateFormattedValue: undefined };
    }

    const initialDate: DateRange = {
      from: value.from ? new Date(value.from) : undefined,
      to: value.to ? new Date(value.to) : undefined,
    };

    const dateFormattedValue = value.from
      ? value.to
        ? `${format(new Date(value.from), 'LLL dd, y')} - ${format(new Date(value.to), 'LLL dd, y')}`
        : format(new Date(value.from), 'LLL dd, y')
      : undefined;

    return { initialDate, dateFormattedValue };
  }, [value]);

  // Combine preset and date values (preset lookup is cheap, no need to memoize)
  const initialDate = dateComputations.initialDate;
  const formattedValue = presetValue?.value || dateComputations.dateFormattedValue;

  const [date, setDate] = useState<DateRange | undefined>(initialDate);

  const directTriggerLabel = dateComputations.dateFormattedValue || placeholder;

  return (
    <Popover onOpenChange={handleChangeOnOpen} open={isOpen}>
      {showCalendarDirectly ? (
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            disabled={disabled}
            className={cn(
              'w-full justify-start text-left font-normal',
              !dateComputations.dateFormattedValue && 'text-muted-foreground'
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {directTriggerLabel}
          </Button>
        </PopoverTrigger>
      ) : (
        <FilterTriggerComponent
          disabled={disabled}
          filterLabel={label}
          multipleCheckboxValues={formattedValue ? [formattedValue] : []}
          onDeleteFilter={() => {
            onRemove();
            setDate(undefined);
          }}
          options={options}
          isRemovable={false}
        />
      )}

      <PopoverContent align="start" className="flex min-w-[250px] p-0 w-auto flex-col space-y-2">
        {showCalendar ? (
          <div className="flex flex-col gap-2 p-2">
            <div className="border-b ">
              <Calendar
                defaultMonth={date?.from}
                initialFocus
                mode="range"
                numberOfMonths={2}
                onSelect={(val) => {
                  setDate(val);
                }}
                selected={date}
                disabled={{ after: new Date() }}
              />
            </div>
            <div className="flex justify-end gap-2 py-2 px-3">
              {showCalendarDirectly ? (
                <Button
                  onClick={() => {
                    setDate(undefined);
                    onRemove();
                    setCustomDateRange('', '');
                    onClose();
                  }}
                  size="sm"
                  variant="ghost"
                >
                  Clear
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    setShowCalendar(false);
                  }}
                  size="sm"
                  variant="outline"
                >
                  Back
                </Button>
              )}
              <Button
                onClick={() => {
                  if (date?.from) {
                    onAdd(CUSTOM);
                    setCustomDateRange(date.from.toISOString(), date.to?.toISOString() || '');
                  } else {
                    onRemove();
                  }
                  onClose();
                }}
                size="sm"
                variant="default"
              >
                Apply
              </Button>
            </div>
          </div>
        ) : (
          <Command ref={commandRef}>
            <CommandList
              style={{
                scrollbarColor: '#E4E4E7 transparent',
                scrollbarWidth: 'thin',
              }}
            >
              <CommandGroup>
                {[...options, { label: 'Custom', value: CUSTOM }].map((option) => (
                  <CommandItem
                    className={cn('cursor-pointer', 'flex items-center justify-between')}
                    key={option.value}
                    onSelect={(value) => {
                      if (value === CUSTOM) {
                        setShowCalendar(true);
                      } else {
                        setDate(undefined);
                        onAdd(value as TimeRange);
                        setCustomDateRange('', '');
                        onClose();
                      }
                    }}
                    value={option.value}
                  >
                    {option.label}
                    <Check
                      className={cn(
                        'ml-2 h-4 w-4 text-gray-400 dark:text-white/50',
                        value === option.value ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}
