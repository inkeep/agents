'use client';

import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface DateTimePickerProps {
  value: string; // ISO string format: "2026-02-15T09:30"
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minDate?: Date;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = 'Select date and time',
  disabled = false,
  minDate,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);

  // Parse value into date and time parts
  const dateValue = value ? new Date(value) : undefined;
  const timeValue = value ? value.slice(11, 16) : '09:00'; // Default to 9:00 AM

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (!selectedDate) return;

    // Combine selected date with current time
    const [hours, minutes] = timeValue.split(':').map(Number);
    selectedDate.setHours(hours, minutes, 0, 0);

    // Format as datetime-local value
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    const hour = String(selectedDate.getHours()).padStart(2, '0');
    const minute = String(selectedDate.getMinutes()).padStart(2, '0');

    onChange(`${year}-${month}-${day}T${hour}:${minute}`);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = e.target.value;
    if (!dateValue) {
      // If no date selected, use today
      const today = new Date();
      const [hours, minutes] = newTime.split(':').map(Number);
      today.setHours(hours, minutes, 0, 0);

      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');

      onChange(`${year}-${month}-${day}T${newTime}`);
    } else {
      // Keep existing date, update time
      const year = dateValue.getFullYear();
      const month = String(dateValue.getMonth() + 1).padStart(2, '0');
      const day = String(dateValue.getDate()).padStart(2, '0');

      onChange(`${year}-${month}-${day}T${newTime}`);
    }
  };

  const formattedDisplay = dateValue
    ? `${format(dateValue, 'PPP')} at ${format(dateValue, 'h:mm a')}`
    : placeholder;

  return (
    <div className="flex flex-col gap-3">
      {/* Date Picker */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Date</Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              disabled={disabled}
              className={cn(
                'w-full justify-start text-left font-normal',
                !dateValue && 'text-muted-foreground'
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateValue ? format(dateValue, 'PPP') : 'Pick a date'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateValue}
              onSelect={(date) => {
                handleDateSelect(date);
                setOpen(false);
              }}
              disabled={minDate ? { before: minDate } : undefined}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Time Picker */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Time</Label>
        <input
          type="time"
          value={timeValue}
          onChange={handleTimeChange}
          disabled={disabled}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      {/* Preview */}
      {dateValue && (
        <div className="rounded-lg border border-border bg-muted/50 p-3">
          <span className="text-sm text-foreground">{formattedDisplay}</span>
        </div>
      )}
    </div>
  );
}
