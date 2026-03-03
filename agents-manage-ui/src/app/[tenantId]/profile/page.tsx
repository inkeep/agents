'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { ProfileForm } from '@/components/user-profile/ProfileForm';
import { useAuthSession } from '@/hooks/use-auth';
import { getUserProfile, type UserProfile } from '@/lib/actions/user-profile';

export default function ProfileSettingsPage() {
  const { user } = useAuthSession();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    getUserProfile(user.id)
      .then(setProfile)
      .finally(() => setIsLoading(false));
  }, [user]);

  if (!user || isLoading) {
    return null;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" description="Manage your personal preferences." />
      <ProfileForm userId={user.id} initialTimezone={profile?.timezone ?? null} />
    </div>
  );
}
