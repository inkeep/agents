'use client';

import { useEffect, useMemo, useState } from 'react';
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
  const browserTimezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const [timezone, setTimezone] = useState(initialTimezone ?? browserTimezone);
  const [isSaving, setIsSaving] = useState(false);

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

    try {
      await updateUserProfileTimezone(userId, timezone);
      toast.success('Timezone saved');
    } catch {
      toast.error('Failed to save timezone. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-sm">
      <div className="space-y-2">
        <FieldLabel
          label="Timezone"
          tooltip="Agents use this to know your local time when responding."
        />
        <Combobox
          options={timezoneOptions}
          onSelect={setTimezone}
          defaultValue={timezone}
          searchPlaceholder="Search timezones..."
          placeholder="Select a timezone"
          className="w-full"
          triggerClassName="w-full"
        />
      </div>
      <Button onClick={handleSave} disabled={isSaving}>
        {isSaving ? 'Saving...' : 'Save'}
      </Button>
    </div>
  );
}
