import { Plus } from "lucide-react";
import { BodyTemplate } from "@/components/layout/body-template";
import EmptyState from "@/components/layout/empty-state";
import { MainContent } from "@/components/layout/main-content";
import { PageHeader } from "@/components/layout/page-header";
import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { ProjectList } from "@/components/projects/project-list";
import { Button } from "@/components/ui/button";
import {
	emptyStateProjectDescription,
	projectDescription,
} from "@/constants/page-descriptions";
import { fetchProjects } from "@/lib/api/projects";
import type { Project } from "@/lib/types/project";

async function ProjectsPage({
	params,
}: {
	params: Promise<{ tenantId: string }>;
}) {
	const { tenantId } = await params;
	let projects: { data: Project[] } = { data: [] };
	try {
		const response = await fetchProjects(tenantId);
		projects = response;
	} catch (_error) {
		// throw new Error('Failed to fetch projects');
	}

	return (
		<BodyTemplate breadcrumbs={[{ label: "Projects" }]}>
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
