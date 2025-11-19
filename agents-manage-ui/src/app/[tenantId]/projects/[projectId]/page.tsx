'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import AgentsLoadingSkeleton from './agents/loading';

export default function ProjectPage() {
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();
  const router = useRouter();

  useEffect(() => {
    // Use client-side navigation instead of server-side redirect
    router.replace(`/${tenantId}/projects/${projectId}/agents`);
  }, [tenantId, projectId, router]);

  // Show loading state while redirecting
  return <AgentsLoadingSkeleton />;
}
