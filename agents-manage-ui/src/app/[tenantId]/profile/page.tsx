'use client';

import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
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
    return (
      <div className="space-y-4 max-w-sm">
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="h-10 w-16" />
      </div>
    );
  }

  return <ProfileForm userId={user.id} initialTimezone={profile?.timezone ?? null} />;
}
