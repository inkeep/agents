'use client';

import { useParams } from 'next/navigation';
import FullPageError from '@/components/errors/full-page-error';

export default function ProjectSettingsError() {
  const { tenantId } = useParams<{
    tenantId: string;
  }>();
  return (
    <FullPageError
      description="Something went wrong."
      link={`/${tenantId}/projects/`}
      linkText="Go back to projects"
    />
  );
}
