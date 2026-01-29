'use client';

import { AlertCircleIcon, CheckCircle2, Loader2, Terminal, XCircle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { InkeepIcon } from '@/components/icons/inkeep';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthClient } from '@/contexts/auth-client';
import { useAuthSession } from '@/hooks/use-auth';

type DeviceState =
  | 'input'
  | 'validating'
  | 'confirm'
  | 'approving'
  | 'approved'
  | 'denied'
  | 'error';

function formatUserCode(code: string): string {
  // Format as XXXX-XXXX if not already formatted
  const cleaned = code.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (cleaned.length === 8) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
  }
  return cleaned;
}

function DeviceVerificationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authClient = useAuthClient();
  const { isAuthenticated, isLoading: authLoading } = useAuthSession();

  const initialCode = searchParams.get('user_code') || '';
  const [userCode, setUserCode] = useState(initialCode);
  const [state, setState] = useState<DeviceState>(initialCode ? 'validating' : 'input');
  const [error, setError] = useState<string | null>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      const currentPath = window.location.pathname + window.location.search;
      router.push(`/login?returnUrl=${encodeURIComponent(currentPath)}`);
    }
  }, [authLoading, isAuthenticated, router]);

  const validateCode = useCallback(
    async (code: string) => {
      setState('validating');
      setError(null);

      try {
        const formattedCode = code.replace(/-/g, '').toUpperCase();
        const response = await authClient.device({
          query: { user_code: formattedCode },
        });

        if (response.error) {
          setError(response.error.error_description || 'Invalid or expired code');
          setState('error');
          return;
        }

        setState('confirm');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to validate code');
        setState('error');
      }
    },
    [authClient]
  );

  // Auto-validate if code provided in URL
  useEffect(() => {
    if (initialCode && isAuthenticated) {
      validateCode(initialCode);
    }
  }, [initialCode, isAuthenticated, validateCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userCode.trim()) return;
    await validateCode(userCode);
  };

  const handleApprove = async () => {
    setState('approving');
    setError(null);

    try {
      const formattedCode = userCode.replace(/-/g, '').toUpperCase();
      const response = await authClient.device.approve({
        userCode: formattedCode,
      });

      if (response.error) {
        setError(response.error.error_description || 'Failed to approve device');
        setState('error');
        return;
      }

      setState('approved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve device');
      setState('error');
    }
  };

  const handleDeny = async () => {
    setState('approving');
    setError(null);

    try {
      const formattedCode = userCode.replace(/-/g, '').toUpperCase();
      const response = await authClient.device.deny({
        userCode: formattedCode,
      });

      if (response.error) {
        setError(response.error.error_description || 'Failed to deny device');
        setState('error');
        return;
      }

      setState('denied');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deny device');
      setState('error');
    }
  };

  const handleReset = () => {
    setUserCode('');
    setState('input');
    setError(null);
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Don't render form if not authenticated (will redirect)
  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md shadow-none border-none bg-transparent space-y-3">
        <div className="flex justify-center">
          <InkeepIcon size={48} />
        </div>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-medium tracking-tight text-foreground flex items-center justify-center gap-2">
            <Terminal className="h-6 w-6" />
            Device Authorization
          </CardTitle>
          <CardDescription>
            {state === 'input' || state === 'validating'
              ? 'Enter the code displayed in your CLI to authorize the device.'
              : state === 'confirm' || state === 'approving'
                ? 'Confirm that you want to authorize this device.'
                : state === 'approved'
                  ? 'Device authorized successfully.'
                  : state === 'denied'
                    ? 'Device authorization denied.'
                    : 'An error occurred.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && (
            <Alert variant="destructive" className="border-destructive/10 dark:border-border">
              <AlertCircleIcon className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Input State */}
          {(state === 'input' || state === 'validating' || state === 'error') && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="userCode">Device Code</Label>
                <Input
                  id="userCode"
                  type="text"
                  placeholder="XXXX-XXXX"
                  value={formatUserCode(userCode)}
                  onChange={(e) => setUserCode(e.target.value.replace(/[^A-Z0-9-]/gi, ''))}
                  required
                  disabled={state === 'validating'}
                  maxLength={9}
                  className="text-center text-2xl font-mono tracking-widest"
                  autoComplete="off"
                  autoFocus
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={state === 'validating' || userCode.replace(/-/g, '').length !== 8}
              >
                {state === 'validating' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Validating...
                  </>
                ) : (
                  'Continue'
                )}
              </Button>
            </form>
          )}

          {/* Confirm State */}
          {(state === 'confirm' || state === 'approving') && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg text-center">
                <p className="text-sm text-muted-foreground mb-1">Authorizing device with code</p>
                <p className="text-2xl font-mono font-bold tracking-widest">
                  {formatUserCode(userCode)}
                </p>
              </div>

              <p className="text-sm text-muted-foreground text-center">
                This will allow the Inkeep CLI to access your account. Only approve if you initiated
                this request.
              </p>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleDeny}
                  disabled={state === 'approving'}
                >
                  {state === 'approving' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Deny'}
                </Button>
                <Button className="flex-1" onClick={handleApprove} disabled={state === 'approving'}>
                  {state === 'approving' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Authorizing...
                    </>
                  ) : (
                    'Approve'
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Approved State */}
          {state === 'approved' && (
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <CheckCircle2 className="h-16 w-16 text-green-500" />
              </div>
              <div>
                <p className="font-medium">Device Authorized</p>
                <p className="text-sm text-muted-foreground mt-1">
                  You can close this window and return to your CLI.
                </p>
              </div>
            </div>
          )}

          {/* Denied State */}
          {state === 'denied' && (
            <div className="space-y-4 text-center">
              <div className="flex justify-center">
                <XCircle className="h-16 w-16 text-red-500" />
              </div>
              <div>
                <p className="font-medium">Authorization Denied</p>
                <p className="text-sm text-muted-foreground mt-1">
                  The device was not authorized. You can close this window.
                </p>
              </div>
              <Button variant="outline" onClick={handleReset} className="w-full">
                Try Another Code
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function DevicePage() {
  return (
    <Suspense
      fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}
    >
      <DeviceVerificationForm />
    </Suspense>
  );
}
