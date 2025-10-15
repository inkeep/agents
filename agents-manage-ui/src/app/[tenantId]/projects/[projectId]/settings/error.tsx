'use client';

import { useParams } from 'next/navigation';
import FullPageError from '@/components/errors/full-page-error';

export default function ProjectSettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { tenantId } = useParams<{
    tenantId: string;
  }>();

  return (
    <FullPageError
      error={error}
      reset={reset}
      link={`/${tenantId}/projects/`}
      linkText="Back to projects"
      context="settings"
    />
  );
}
