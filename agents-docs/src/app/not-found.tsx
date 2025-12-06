'use client';

import Link from 'next/link';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

export default function NotFound() {
  useEffect(() => {
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div className="fixed inset-0 top-[var(--fd-nav-height)] flex flex-col items-center justify-center px-4 bg-background text-foreground">
      <h1 className="text-6xl font-bold text-fd-muted-foreground mb-4">404</h1>
      <h2 className="text-xl font-medium text-fd-muted-foreground mb-6">
        This page could not be found.
      </h2>
      <p className="text-fd-muted-foreground mb-8 text-center max-w-md">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Button asChild>
        <Link href="/">Go to Overview</Link>
      </Button>
    </div>
  );
}
