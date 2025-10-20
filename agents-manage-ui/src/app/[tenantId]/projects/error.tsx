'use client';

import FullPageError from '@/components/errors/full-page-error';

export default function ProjectsErrorBoundary({
  error,
  reset,
}: {
  error: Error & { cause?: { code: string; status: number } & { message: string } };
  reset: () => void;
}) {
  return (
    <FullPageError
      error={error}
      title="Something went wrong."
      description="An unexpected error occurred. Please try again."
      reset={reset}
    />
  );
}
