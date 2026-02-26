'use client';

import { XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ErrorContent } from '@/components/errors/full-page-error';
import { Button } from '@/components/ui/button';
import { STATIC_LABELS } from '@/constants/theme';
import { useAuthSession } from '@/hooks/use-auth';

export default function NoOrganizationPage() {
  const router = useRouter();
  const { user } = useAuthSession();

  const handleSignOut = () => {
    router.push('/logout');
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <ErrorContent
        title={STATIC_LABELS['no-organization-found']}
        icon={XCircle}
        showRetry={false}
        description={
          <div className="flex flex-col space-y-5">
            <p>
              Your account {user?.email ? <span className="font-semibold">{user?.email}</span> : ''}{' '}
              is not associated with any organization. Please contact your organization
              administrator to request access.
            </p>
            <Button onClick={handleSignOut} variant="outline" className="w-full">
              Sign Out
            </Button>
          </div>
        }
      />
    </div>
  );
}
