'use client';

import { LockIcon, SlackIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import { CHANNEL_ACCESS_OPTIONS } from './types';

interface ChannelAccessPopoverProps {
  grantAccess: boolean;
  onToggleGrantAccess: (grantAccess: boolean) => void;
  idPrefix?: string;
  closeOnSelect?: boolean;
}

export function ChannelAccessPopover({
  grantAccess,
  onToggleGrantAccess,
  idPrefix = 'access',
  closeOnSelect = true,
}: ChannelAccessPopoverProps) {
  const [open, setOpen] = useState(false);

  const handleValueChange = (v: string) => {
    onToggleGrantAccess(v === 'true');
    if (closeOnSelect) setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className={cn('h-8 min-w-0 max-w-full text-xs')}>
          {grantAccess ? (
            <SlackIcon className="size-3.5 shrink-0" />
          ) : (
            <LockIcon className="size-3.5 shrink-0" />
          )}
          <span>{grantAccess ? 'Channel members' : 'Project access'}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-1.5">
        <div className="flex flex-col gap-0.5">
          <RadioGroup
            value={String(grantAccess)}
            onValueChange={handleValueChange}
            className="flex flex-col gap-0.5"
          >
            {CHANNEL_ACCESS_OPTIONS.map((option) => (
              <label
                key={option.id}
                htmlFor={`${idPrefix}-${option.id}`}
                className={cn(
                  'flex items-start gap-3 rounded-md px-3 py-2.5 cursor-pointer transition-colors',
                  'hover:bg-accent/50 has-data-[state=checked]:bg-accent'
                )}
              >
                <RadioGroupItem
                  value={String(option.value)}
                  id={`${idPrefix}-${option.id}`}
                  className="mt-0.5"
                />
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">{option.label}</span>
                  <p className="text-xs text-muted-foreground leading-normal">
                    {option.description}
                  </p>
                </div>
              </label>
            ))}
          </RadioGroup>
        </div>
      </PopoverContent>
    </Popover>
  );
}
