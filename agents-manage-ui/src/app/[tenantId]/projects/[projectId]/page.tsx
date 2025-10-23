'use client';

import { Loader2 } from 'lucide-react';
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
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="size-4 animate-spin text-muted-foreground" />
    </div>
  );
}
