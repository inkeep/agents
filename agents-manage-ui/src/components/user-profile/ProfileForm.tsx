'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FieldLabel } from '@/components/agent/sidepane/form-components/label';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { updateUserProfileTimezone } from '@/lib/actions/user-profile';

interface ProfileFormProps {
  userId: string;
  initialTimezone: string | null;
}

export function ProfileForm({ userId, initialTimezone }: ProfileFormProps) {
  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const initial = initialTimezone ?? browserTimezone;
  const [timezone, setTimezone] = useState(initial);
  const [savedTimezone, setSavedTimezone] = useState(initial);
  const [isSaving, setIsSaving] = useState(false);

  const timezoneOptions = Intl.supportedValuesOf('timeZone').map((tz) => ({
    value: tz,
    label: tz,
  }));

  useEffect(() => {
    const next = initialTimezone ?? browserTimezone;
    setTimezone(next);
    setSavedTimezone(next);
  }, [initialTimezone, browserTimezone]);

  const isDirty = timezone !== savedTimezone;

  const handleSave = async () => {
    setIsSaving(true);

    try {
      await updateUserProfileTimezone(userId, timezone);
      setSavedTimezone(timezone);
      toast.success('Timezone saved');
    } catch {
      toast.error('Failed to save timezone. Please try again.');
    }
    setIsSaving(false);
  };

  return (
    <div className="space-y-2 max-w-sm">
      <FieldLabel
        label="Timezone"
        tooltip="Agents use this to know your local time when responding."
      />
      <div className="flex items-center gap-2">
        <Combobox
          options={timezoneOptions}
          onSelect={setTimezone}
          defaultValue={timezone}
          searchPlaceholder="Search timezones..."
          placeholder="Select a timezone"
          className="flex-1"
          triggerClassName="w-full"
        />
        <Button onClick={handleSave} disabled={!isDirty || isSaving} className="shrink-0">
          {isSaving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
