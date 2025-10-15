'use client';

import FullPageError from '@/components/errors/full-page-error';

export default function ArtifactComponentsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <FullPageError error={error} reset={reset} context="artifacts" />;
}
