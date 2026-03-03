'use client';

import { useEffect, useState } from 'react';
import { ProfileForm } from '@/components/user-profile/ProfileForm';
import { useRuntimeConfig } from '@/contexts/runtime-config';
import { useAuthSession } from '@/hooks/use-auth';

interface UserProfile {
  userId: string;
  timezone: string | null;
  attributes: Record<string, unknown>;
}

export default function ProfileSettingsPage() {
  const { user } = useAuthSession();
  const { PUBLIC_INKEEP_AGENTS_API_URL } = useRuntimeConfig();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const userId = user.id;

    async function fetchProfile() {
      try {
        const res = await fetch(
          `${PUBLIC_INKEEP_AGENTS_API_URL}/manage/api/users/${userId}/profile`,
          { credentials: 'include' }
        );
        if (res.ok) {
          setProfile(await res.json());
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchProfile();
  }, [user, PUBLIC_INKEEP_AGENTS_API_URL]);

  if (!user || isLoading) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-medium">Profile</h2>
        <p className="text-sm text-muted-foreground">Manage your personal preferences.</p>
      </div>
      <ProfileForm userId={user.id} initialTimezone={profile?.timezone ?? null} />
    </div>
  );
}
