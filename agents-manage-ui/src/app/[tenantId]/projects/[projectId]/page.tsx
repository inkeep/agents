'use client';

import AgentsLoading from './agents/loading';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ProjectPage() {
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();
  const router = useRouter();

  useEffect(() => {
    // Use client-side navigation instead of server-side redirect
    router.replace(`/${tenantId}/projects/${projectId}/agents`);
  }, [tenantId, projectId, router]);

  // Show loading state while redirecting
  return <AgentsLoading />;
}
