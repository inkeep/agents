'use client';

import cronstrue from 'cronstrue';
import { useMemo, useState } from 'react';
import 'cronstrue/locales/en';
import parser from 'cron-parser';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

type Option = { value: string | null; label: string };

const PRESETS: Option[] = [
  { value: null, label: 'Manual (one-time runs only)' },
  { value: '0 0 * * *', label: 'Daily (midnight)' },
  { value: '0 0 * * 0', label: 'Weekly (Sunday midnight)' },
  { value: '0 0 1 * *', label: 'Monthly (1st of month)' },
  { value: '0 */6 * * *', label: 'Every 6 hours' },
  { value: '0 0 * * 1', label: 'Weekly (Monday midnight)' },
];

export function SchedulePicker({
  value,
  onChange,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
  disabled,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  timezone?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(
    !!value && !PRESETS.some((p) => p.value === value)
  );
  const [customCron, setCustomCron] = useState<string>(value ?? '');

  const pretty = useMemo(() => {
    if (!value) return 'Manual';
    try {
      return cronstrue.toString(value, { locale: 'en' });
    } catch {
      return 'Invalid cron';
    }
  }, [value]);

  const nextRuns = useMemo(() => {
    if (!value) return [];
    try {
      const it = parser.parseExpression(value, { tz: timezone });
      return Array.from({ length: 5 }).map(() => it.next().toString());
    } catch {
      return [];
    }
  }, [value, timezone]);

  const applyPreset = (v: string | null) => {
    onChange(v);
    setCustomCron(v ?? '');
    setShowAdvanced(!!v && !PRESETS.some((p) => p.value === v));
    setOpen(false);
  };

  const applyCustom = () => {
    if (!customCron) {
      onChange(null);
      setOpen(false);
      return;
    }
    try {
      parser.parseExpression(customCron, { tz: timezone });
      onChange(customCron);
      setOpen(false);
    } catch (e) {
      // leave popover open; user sees preview failure below
    }
  };

  const customValid = useMemo(() => {
    if (!customCron) return true;
    try {
      parser.parseExpression(customCron, { tz: timezone });
      return true;
    } catch {
      return false;
    }
  }, [customCron, timezone]);

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="w-full justify-between"
          >
            <span className={cn(!value && 'text-muted-foreground')}>{pretty}</span>
            <span className="text-xs text-muted-foreground">{timezone}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[520px] p-4">
          <Tabs
            defaultValue={showAdvanced ? 'custom' : 'presets'}
            onValueChange={(v) => setShowAdvanced(v === 'custom')}
          >
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="presets">Presets</TabsTrigger>
              <TabsTrigger value="custom">Custom</TabsTrigger>
            </TabsList>

            <TabsContent value="presets" className="mt-4">
              <ScrollArea className="h-56 border rounded-md">
                <div className="p-2 space-y-1">
                  {PRESETS.map((opt) => {
                    const isSelected = (opt.value ?? '') === (value ?? '');
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => applyPreset(opt.value)}
                        className={cn(
                          'w-full text-left px-3 py-2 rounded-md hover:bg-muted',
                          isSelected && 'bg-muted'
                        )}
                      >
                        <div className="font-medium">{opt.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {opt.value ? cronstrue.toString(opt.value) : 'No schedule'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="custom" className="mt-4 space-y-3">
              <div className="space-y-2">
                <Label htmlFor="cron">Cron expression</Label>
                <Input
                  id="cron"
                  placeholder="e.g. 0 9 * * 1-5"
                  value={customCron}
                  onChange={(e) => setCustomCron(e.target.value)}
                />
                <div className="text-xs">
                  {customCron
                    ? customValid
                      ? cronstrue.toString(customCron)
                      : 'Invalid cron'
                    : 'Leave empty to set Manual'}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium">Next runs ({timezone})</div>
                <div className="text-xs text-muted-foreground">
                  {customCron && customValid
                    ? (() => {
                        const it = parser.parseExpression(customCron, { tz: timezone });
                        const arr = Array.from({ length: 5 }).map(() => it.next().toString());
                        return arr.join(' • ');
                      })()
                    : '—'}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="manual"
                    checked={!customCron}
                    onCheckedChange={(c) => setCustomCron(c ? '' : (value ?? ''))}
                  />
                  <Label htmlFor="manual">Manual (no schedule)</Label>
                </div>
                <Button type="button" onClick={applyCustom} disabled={!customValid}>
                  Use this schedule
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </PopoverContent>
      </Popover>

      <div className="text-sm text-muted-foreground">
        {value ? 'Runs will be scheduled automatically' : 'Runs must be triggered manually'}
      </div>
    </div>
  );
}
