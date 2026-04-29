'use client';

import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ProfileForm } from '@/components/user-profile/ProfileForm';
import { SessionsSection } from '@/components/user-profile/SessionsSection';
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
      <div className="space-y-8">
        <section className="space-y-4">
          <Skeleton className="h-5 w-32" />
          <div className="space-y-2 max-w-sm">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-16" />
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h3 className="text-base font-medium">Preferences</h3>
        <ProfileForm userId={user.id} initialTimezone={profile?.timezone ?? null} />
      </section>
      <SessionsSection />
    </div>
  );
}
