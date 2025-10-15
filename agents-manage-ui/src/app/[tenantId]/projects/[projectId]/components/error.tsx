'use client';

import FullPageError from '@/components/errors/full-page-error';

export default function DataComponentsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <FullPageError error={error} reset={reset} context="components" />;
}
