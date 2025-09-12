'use client';

import { useParams } from 'next/navigation';
import FullPageError from '@/components/errors/full-page-error';

export default function DataComponentError() {
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();
  return (
    <FullPageError
      description="Something went wrong."
      link={`/${tenantId}/projects/${projectId}/data-components`}
      linkText="Go back to data components"
    />
  );
}
