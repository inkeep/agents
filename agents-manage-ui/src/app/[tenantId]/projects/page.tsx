import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import EmptyState from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { CreateProjectButton } from '@/components/projects/create-project-button';
import { ProjectList } from '@/components/projects/project-list';
import { emptyStateProjectDescription, projectDescription } from '@/constants/page-descriptions';
import { fetchProjects } from '@/lib/api/projects';
import { getErrorCode } from '@/lib/utils/error-serialization';

async function ProjectsPage({ params }: PageProps<'/[tenantId]/projects'>) {
  const { tenantId } = await params;

  try {
    const projects = await fetchProjects(tenantId);
    const content = projects.data.length ? (
      <>
        <PageHeader
          title="Projects"
          description={projectDescription}
          action={<CreateProjectButton tenantId={tenantId} />}
        />
        <ProjectList tenantId={tenantId} projects={projects.data} />
      </>
    ) : (
      <EmptyState
        title="No projects yet."
        description={emptyStateProjectDescription}
        action={
          <CreateProjectButton tenantId={tenantId} size="lg" label="Create your first project" />
        }
      />
    );
    return <BodyTemplate breadcrumbs={[]}>{content}</BodyTemplate>;
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="projects" />;
  }
}

export default ProjectsPage;
