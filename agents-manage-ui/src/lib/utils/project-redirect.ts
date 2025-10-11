'use server';

import { redirect } from 'next/navigation';
import { fetchProjects } from '../api/projects';

/**
 * Fetches projects and redirects to the appropriate project page.
 * If no projects exist, redirects to the create project page.
 * If there's an error fetching projects, also redirects to create project page.
 */
export async function redirectToProject(
  tenantId: string,
  targetPath: string = 'agent'
): Promise<never> {
  try {
    const result = await fetchProjects(tenantId);

    if (result.data && result.data.length > 0) {
      // Redirect to the first project in the list
      const firstProject = result.data[0];
      redirect(`/${tenantId}/projects/${firstProject.projectId}/${targetPath}`);
    } else {
      // No projects found, redirect to projects page
      redirect(`/${tenantId}/projects`);
    }
  } catch (error) {
    // Re-throw redirect errors (these are expected Next.js behavior)
    if (
      error instanceof Error &&
      (error.message === 'NEXT_REDIRECT' || (error as any).digest?.startsWith('NEXT_REDIRECT'))
    ) {
      throw error;
    }

    // Actual error occurred, redirect to projects landing page
    console.error('Error fetching projects, redirecting to projects page:', error);
    redirect(`/${tenantId}/projects`);
  }
}
