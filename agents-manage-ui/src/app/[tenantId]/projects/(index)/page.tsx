import { PartyPopper, Plus } from 'lucide-react';
import FullPageError from '@/components/errors/full-page-error';
import EmptyState from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { NewProjectDialog } from '@/components/projects/new-project-dialog';
import { ProjectList } from '@/components/projects/project-list';
import { Button } from '@/components/ui/button';
import { emptyStateProjectDescription, projectDescription } from '@/constants/page-descriptions';
import { fetchProjects } from '@/lib/api/projects';
import { getErrorCode } from '@/lib/utils/error-serialization';

function PreviewBranchBanner() {
  return (
    <div className="mb-6 flex items-center gap-3 rounded-lg border border-green-500/50 bg-green-500/10 p-4">
      <PartyPopper className="h-6 w-6 text-green-500" />
      <div>
        <h3 className="font-semibold text-green-500">
          🎉 Congrats, you made it to my preview branch!
        </h3>
      </div>
    </div>
  );
}

async function ProjectsPage({ params }: PageProps<'/[tenantId]/projects'>) {
  const { tenantId } = await params;

  try {
    const projects = await fetchProjects(tenantId);
    return projects.data.length > 0 ? (
      <>
        <PreviewBranchBanner />
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
        <ProjectList tenantId={tenantId} projects={projects.data} />
      </>
    ) : (
      <>
        <PreviewBranchBanner />
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
      </>
    );
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="projects" />;
  }
}

export default ProjectsPage;
