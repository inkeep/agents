'use client';

import { XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorContent } from '@/components/errors/full-page-error';
import { Button } from '@/components/ui/button';
import { useAuthClient } from '@/contexts/auth-client';
import { useAuthSession } from '@/hooks/use-auth';

export default function NoOrganizationPage() {
  const router = useRouter();
  const { user } = useAuthSession();
  const authClient = useAuthClient();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await authClient.signOut();
    router.push('/login');
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <ErrorContent
        title="  No organization found"
        icon={XCircle}
        showRetry={false}
        description={
          <div className="flex flex-col space-y-5">
            {isSigningOut ? (
              <p>Signing out...</p>
            ) : (
              <div>
                Your account{' '}
                {user?.email ? <span className="font-semibold">{user?.email}</span> : ''} is not
                associated with any organization. Please contact your organization administrator to
                request access.
              </div>
            )}
            <Button
              onClick={handleSignOut}
              variant="outline"
              className="w-full"
              disabled={isSigningOut}
            >
              {isSigningOut ? 'Signing out...' : 'Sign Out'}
            </Button>
          </div>
        }
      />
    </div>
  );
}
