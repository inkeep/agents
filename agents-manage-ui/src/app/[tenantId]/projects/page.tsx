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
import { getValidSearchParamsAsync } from '@/lib/utils/search-params';

async function ProjectsPage({ params, searchParams }: PageProps<'/[tenantId]/projects'>) {
  const { tenantId } = await params;
  const { ref } = await getValidSearchParamsAsync(searchParams);

  let projects: Awaited<ReturnType<typeof fetchProjects>>;
  try {
    projects = await fetchProjects(tenantId);
  } catch (error) {
    return <FullPageError error={error as Error} context="projects" />;
  }

  return (
    <BodyTemplate>
      <MainContent className="min-h-full">
        {projects.data.length > 0 ? (
          <>
            <PageHeader
              title="Projects"
              description={projectDescription}
              action={
                <NewProjectDialog tenantId={tenantId}>
                  <Button>
                    <Plus />
                    Create project
                  </Button>
                </NewProjectDialog>
              }
            />
            <ProjectList tenantId={tenantId} projects={projects.data} ref={ref} />
          </>
        ) : (
          <EmptyState
            title="No projects yet."
            description={emptyStateProjectDescription}
            action={
              <NewProjectDialog tenantId={tenantId}>
                <Button size="lg">
                  <Plus />
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
