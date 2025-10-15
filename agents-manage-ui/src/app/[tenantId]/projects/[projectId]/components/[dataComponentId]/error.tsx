'use client';

import { useParams } from 'next/navigation';
import FullPageError from '@/components/errors/full-page-error';

export default function DataComponentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();

  return (
    <FullPageError
      error={error}
      reset={reset}
      link={`/${tenantId}/projects/${projectId}/components`}
      linkText="Back to components"
      context="component"
    />
  );
}
