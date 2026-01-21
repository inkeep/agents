import FullPageError from '@/components/errors/full-page-error';
import EmptyState from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { CreateProjectButton } from '@/components/projects/create-project-button';
import { ProjectItem } from '@/components/projects/project-item';
import { emptyStateProjectDescription, projectDescription } from '@/constants/page-descriptions';
import { STATIC_LABELS } from '@/constants/theme';
import { fetchProjects } from '@/lib/api/projects';
import { getErrorCode } from '@/lib/utils/error-serialization';

async function ProjectsPage({ params }: PageProps<'/[tenantId]/projects'>) {
  const { tenantId } = await params;

  try {
    const { data } = await fetchProjects(tenantId);
    return data.length ? (
      <>
        <PageHeader
          title={STATIC_LABELS.projects}
          description={projectDescription}
          action={<CreateProjectButton tenantId={tenantId} />}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
          {data.map((project) => (
            <ProjectItem key={project.id} {...project} tenantId={tenantId} />
          ))}
        </div>
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
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="projects" />;
  }
}

export default ProjectsPage;
