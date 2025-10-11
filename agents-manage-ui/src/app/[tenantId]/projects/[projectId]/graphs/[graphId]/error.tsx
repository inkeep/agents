'use client';

import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import FullPageError from '@/components/errors/full-page-error';

export default function GraphError({ error }: { error: Error & { digest?: string } }) {
  const { tenantId, projectId } = useParams();
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <FullPageError
      description="Something went wrong."
      link={`/${tenantId}/projects/${projectId}/agent`}
      linkText="Go back to agent"
    />
  );
}
