'use client';

import { useParams } from 'next/navigation';
import FullPageError from '@/components/errors/full-page-error';

export default function AgentError({
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
      link={`/${tenantId}/projects/${projectId}/agents`}
      linkText="Back to agents"
      context="agent"
    />
  );
}
