'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import { updateUserProfileTimezone } from '@/lib/actions/user-profile';

interface ProfileFormProps {
  userId: string;
  initialTimezone: string | null;
}

export function ProfileForm({ userId, initialTimezone }: ProfileFormProps) {
  const browserTimezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const [timezone, setTimezone] = useState(initialTimezone ?? browserTimezone);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const timezoneOptions = useMemo(
    () =>
      Intl.supportedValuesOf('timeZone').map((tz) => ({
        value: tz,
        label: tz,
      })),
    []
  );

  useEffect(() => {
    setTimezone(initialTimezone ?? browserTimezone);
  }, [initialTimezone, browserTimezone]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('idle');

    try {
      await updateUserProfileTimezone(userId, timezone);
      setSaveStatus('success');
    } catch {
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-sm">
      <div className="space-y-2">
        <Label>Timezone</Label>
        <Combobox
          options={timezoneOptions}
          onSelect={(value) => {
            setTimezone(value);
            setSaveStatus('idle');
          }}
          defaultValue={timezone}
          searchPlaceholder="Search timezones..."
          placeholder="Select a timezone"
          className="w-full"
          triggerClassName="w-full"
        />
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save'}
        </Button>
        {saveStatus === 'success' && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">Saved</p>
        )}
        {saveStatus === 'error' && (
          <p className="text-sm text-destructive">Failed to save. Please try again.</p>
        )}
      </div>
    </div>
  );
}
