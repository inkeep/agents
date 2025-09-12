'use client';

import { useParams } from 'next/navigation';
import FullPageError from '@/components/errors/full-page-error';

export default function ArtifactComponentError() {
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();
  return (
    <FullPageError
      description="Something went wrong."
      link={`/${tenantId}/projects/${projectId}/artifact-components`}
      linkText="Go back to artifact components"
    />
  );
}
