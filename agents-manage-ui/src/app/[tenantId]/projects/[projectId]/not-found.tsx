'use client';

import { AlertCircle } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function ProjectNotFound() {
  const params = useParams();
  const router = useRouter();
  const tenantId = params.tenantId as string;
  const projectId = params.projectId as string;

  useEffect(() => {
    // Auto-redirect after 3 seconds
    const timer = setTimeout(() => {
      router.push(`/${tenantId}/projects`);
    }, 3000);

    return () => clearTimeout(timer);
  }, [tenantId, router]);

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="mb-4 flex justify-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-semibold mb-2">Project Not Found</h1>
        <p className="text-muted-foreground mb-6">
          The project "{projectId}" does not exist or you don't have access to it.
        </p>
        <p className="text-sm text-muted-foreground mb-6">
          Redirecting to projects list in 3 seconds...
        </p>
        <Button onClick={() => router.push(`/${tenantId}/projects`)} variant="default">
          Go to Projects List
        </Button>
      </div>
    </div>
  );
}
