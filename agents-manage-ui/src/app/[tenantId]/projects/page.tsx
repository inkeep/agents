import { Plus } from 'lucide-react';
import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import EmptyState from '@/components/layout/empty-state';
import { MainContent } from '@/components/layout/main-content';
import { PageHeader } from '@/components/layout/page-header';
import { NewProjectDialog } from '@/components/projects/new-project-dialog';
import { ProjectList } from '@/components/projects/project-list';
import { Button } from '@/components/ui/button';
import { emptyStateProjectDescription, projectDescription } from '@/constants/page-descriptions';
import { fetchProjects } from '@/lib/api/projects';

async function ProjectsPage({ params }: PageProps<'/[tenantId]/projects'>) {
  const { tenantId } = await params;

  let projects: Awaited<ReturnType<typeof fetchProjects>>;
  try {
    projects = await fetchProjects(tenantId);
  } catch (error) {
    return <FullPageError error={error as Error} context="projects" />;
  }

  return (
    <BodyTemplate breadcrumbs={[{ label: 'Projects' }]}>
      <MainContent className="min-h-full">
        {projects.data.length > 0 ? (
          <>
            <PageHeader
              title="Projects"
              description={projectDescription}
              action={
                <NewProjectDialog tenantId={tenantId}>
                  <Button size="lg" className="gap-2">
                    <Plus className="h-4 w-4" />
                    Create project
                  </Button>
                </NewProjectDialog>
              }
            />
            <ProjectList tenantId={tenantId} projects={projects.data} />
          </>
        ) : (
          <EmptyState
            title="No projects yet."
            description={emptyStateProjectDescription}
            action={
              <NewProjectDialog tenantId={tenantId}>
                <Button size="lg" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create your first project
                </Button>
              </NewProjectDialog>
            }
          />
        )}
      </MainContent>
    </BodyTemplate>
  );
}

export default ProjectsPage;
