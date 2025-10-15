'use client';

import FullPageError from '@/components/errors/full-page-error';

export default function ProjectsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <FullPageError error={error} reset={reset} context="projects" />;
}
