'use client';

import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';

function SetupErrorContent() {
  const searchParams = useSearchParams();
  const message = searchParams.get('message') || 'An error occurred during GitHub App setup.';

  return (
    <main
      aria-labelledby="error-title"
      className="flex flex-col items-center justify-center h-full min-h-screen gap-10 px-4"
    >
      <h1 id="error-title" className="sr-only">
        GitHub App Setup Error
      </h1>
      <AlertTriangle className="w-14 h-14 text-foreground" strokeWidth={1} aria-hidden="true" />
      <div className="flex flex-col items-center gap-2 text-center max-w-md">
        <h2 className="text-lg text-muted-foreground font-mono uppercase">Setup Failed</h2>
        <div className="text-muted-foreground text-sm">{message}</div>
        <div className="text-muted-foreground text-sm">
          Please uninstall the app from your GitHub organization and try again.
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button asChild variant="outline">
          <Link href="/">Go to Dashboard</Link>
        </Button>
      </div>
    </main>
  );
}

export default function GitHubSetupErrorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center h-full min-h-screen">
          <div className="text-muted-foreground text-sm">Loading...</div>
        </div>
      }
    >
      <SetupErrorContent />
    </Suspense>
  );
}
