import type { Project } from '@/lib/types/project';
import { ProjectItem } from './project-item';

interface ProjectListProps {
  tenantId: string;
  projects: Project[];
}

export async function ProjectList({ tenantId, projects }: ProjectListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
      {projects?.map((project: Project) => (
        <ProjectItem key={project.id} {...project} tenantId={tenantId} />
      ))}
    </div>
  );
}
