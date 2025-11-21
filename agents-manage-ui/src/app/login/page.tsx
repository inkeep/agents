'use client';

import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthClient } from '@/lib/auth-client';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invitationId = searchParams.get('invitation');
  const authClient = useAuthClient();

  // For OAuth, we need the full URL to redirect back to the UI
  const getFullCallbackURL = () => {
    if (typeof window === 'undefined') return '/';
    const baseURL = window.location.origin; // http://localhost:3000
    // If there's a pending invitation, include it in callback
    if (invitationId) {
      return `${baseURL}/?invitation=${invitationId}`;
    }
    return `${baseURL}/`;
  };

  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');

  // Check for OAuth/SSO errors in URL params (e.g., from provider redirects)
  const urlError = searchParams.get('error');
  const urlErrorDescription = searchParams.get('error_description');
  const initialError = urlError ? `${urlErrorDescription || urlError}`.replace(/_/g, ' ') : null;

  const [error, setError] = useState<string | null>(initialError);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result =
        mode === 'signup'
          ? await authClient.signUp.email({
              email: formData.email,
              password: formData.password,
              name: formData.name,
            })
          : await authClient.signIn.email({
              email: formData.email,
              password: formData.password,
            });

      // Check if sign-in/sign-up failed
      if (result?.error) {
        setError(result.error.message || (mode === 'signup' ? 'Sign up failed' : 'Sign in failed'));
        setIsLoading(false);
        return;
      }

      // Redirect to invitation page if invitation param exists
      if (invitationId) {
        router.push(`/accept-invitation/${invitationId}`);
      } else {
        router.push('/');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setIsLoading(false);
    }
  };

  const handleSsoSignIn = async (providerId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await authClient.signIn.sso({
        providerId,
        callbackURL: getFullCallbackURL(),
      });

      // If we got here without redirecting, something went wrong
      if (result?.error) {
        setError(result.error.message || 'SSO sign in failed');
        setIsLoading(false);
      }
    } catch (err) {
      let errorMessage = 'SSO sign in failed';

      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'object' && err !== null) {
        const errorObj = err as any;
        errorMessage = errorObj.message || errorObj.error || errorMessage;
      }

      setError(errorMessage);
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 dark:bg-gray-900">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </CardTitle>
          <CardDescription>
            {mode === 'signin'
              ? 'Sign in to your account to continue'
              : 'Create a new account to get started'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="John Doe"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  disabled={isLoading}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                disabled={isLoading}
                minLength={8}
              />
              {mode === 'signup' && (
                <p className="text-xs text-gray-500">Must be at least 8 characters</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {mode === 'signin' ? 'Signing in...' : 'Creating account...'}
                </>
              ) : mode === 'signin' ? (
                'Sign in'
              ) : (
                'Create account'
              )}
            </Button>
          </form>

          {process.env.NEXT_PUBLIC_AUTH0_DOMAIN && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>

              <div className="space-y-2">
                <Button
                  variant="outline"
                  onClick={() => handleSsoSignIn('auth0')}
                  disabled={isLoading}
                  className="w-full"
                >
                  <Image
                    src="/assets/inkeep-icons/icon-blue.svg"
                    alt="Inkeep"
                    width={16}
                    height={16}
                    className="mr-2"
                  />
                  Inkeep
                </Button>
              </div>
            </>
          )}

          <div className="text-center text-sm">
            {mode === 'signin' ? (
              <>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  className="text-primary underline underline-offset-4 hover:text-primary/80"
                  disabled={isLoading}
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => setMode('signin')}
                  className="text-primary underline underline-offset-4 hover:text-primary/80"
                  disabled={isLoading}
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}
    >
      <LoginForm />
    </Suspense>
  );
}
