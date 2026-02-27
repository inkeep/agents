'use client';

import { AlertCircleIcon, ArrowLeft, Loader2, Mail } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { InkeepIcon } from '@/components/icons/inkeep';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthClient } from '@/contexts/auth-client';
import { useRuntimeConfig } from '@/contexts/runtime-config';

function ForgotPasswordForm() {
  const authClient = useAuthClient();
  const { PUBLIC_IS_SMTP_CONFIGURED } = useRuntimeConfig();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (!PUBLIC_IS_SMTP_CONFIGURED) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md shadow-none border-none bg-transparent space-y-3">
          <div className="px-6">
            <InkeepIcon size={48} aria-hidden="true" />
          </div>
          <CardHeader>
            <CardTitle className="text-2xl font-medium tracking-tight text-foreground">
              Password reset unavailable
            </CardTitle>
            <CardDescription>
              Self-service password reset is not available. Contact your administrator to reset your
              password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="ghost" asChild className="px-0">
              <Link href="/login">
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                Back to sign in
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md shadow-none border-none bg-transparent space-y-3">
          <div className="px-6">
            <InkeepIcon size={48} aria-hidden="true" />
          </div>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Mail className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              <CardTitle className="text-2xl font-medium tracking-tight text-foreground">
                Check your email
              </CardTitle>
            </div>
            <CardDescription>
              If an account exists with that email, we sent a password reset link. Check your inbox
              and spam folder.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="ghost" asChild className="px-0">
              <Link href="/login">
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                Back to sign in
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (result?.error) {
        setSubmitted(true);
        return;
      }

      setSubmitted(true);
    } catch (err) {
      console.error('[forgot-password] Request failed:', err);
      setError('Could not send reset email. Please try again later.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md shadow-none border-none bg-transparent space-y-3">
        <div className="px-6">
          <InkeepIcon size={48} aria-hidden="true" />
        </div>
        <CardHeader>
          <CardTitle className="text-2xl font-medium tracking-tight text-foreground">
            Forgot your password?
          </CardTitle>
          <CardDescription>
            Enter your email address and we'll send you a link to reset your password.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && (
            <Alert variant="destructive" className="border-destructive/10 dark:border-border">
              <AlertCircleIcon className="h-4 w-4" aria-hidden="true" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isSubmitting}
                autoFocus
              />
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting || !email}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Sending...
                </>
              ) : (
                'Send reset link'
              )}
            </Button>
          </form>

          <Button variant="ghost" asChild className="px-0">
            <Link href="/login">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Back to sign in
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      }
    >
      <ForgotPasswordForm />
    </Suspense>
  );
}
