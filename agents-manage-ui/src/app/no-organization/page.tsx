'use client';

import { AlertTriangleIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthSession } from '@/hooks/use-auth';
import { useAuthClient } from '@/lib/auth-client';

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
      <Card className="w-full max-w-md shadow-none border-none bg-transparent">
        <CardHeader>
          <CardTitle className="text-2xl font-medium tracking-tight text-foreground">
            No organization found
          </CardTitle>
          <CardDescription>You are not a member of any organization.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <Alert variant="warning" className="max-w-md">
            <AlertTriangleIcon className="h-4 w-4" />
            <AlertTitle>Access Required</AlertTitle>
            <AlertDescription>
              {isSigningOut ? (
                <p>Signing out...</p>
              ) : (
                <>
                  <p>
                    Your account{' '}
                    {user?.email ? <span className="font-semibold">{user?.email}</span> : ''} is not
                    associated with any organization.
                  </p>
                  <p>Please contact your organization administrator to request access.</p>
                </>
              )}
            </AlertDescription>
          </Alert>
          <div className="flex flex-col gap-2">
            <Button
              onClick={handleSignOut}
              variant="outline"
              className="w-full"
              disabled={isSigningOut}
            >
              {isSigningOut ? 'Signing out...' : 'Sign Out'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
