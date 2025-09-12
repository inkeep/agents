import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
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
    // If project doesn't exist, show 404 page
    notFound();
  }

  return <>{children}</>;
}
