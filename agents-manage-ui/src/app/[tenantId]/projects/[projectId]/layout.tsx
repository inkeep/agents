import type { ReactNode } from 'react';
import FullPageError from '@/components/errors/full-page-error';
import { fetchProject } from '@/lib/api/projects';

export const dynamic = 'force-dynamic';

interface ProjectLayoutProps {
  children: ReactNode;
  params: Promise<{ tenantId: string; projectId: string }>;
}

export default async function ProjectLayout({ children, params }: ProjectLayoutProps) {
  const { tenantId, projectId } = await params;

  try {
    // Verify project exists
    await fetchProject(tenantId, projectId);
  } catch (_error) {
    return <FullPageError error={_error as Error} context="project" />;
  }

  return <>{children}</>;
}
