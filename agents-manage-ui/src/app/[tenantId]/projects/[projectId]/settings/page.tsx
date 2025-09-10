import { BodyTemplate } from "@/components/layout/body-template";
import { MainContent } from "@/components/layout/main-content";
import { ProjectForm } from "@/components/projects/form/project-form";
import { fetchProject } from "@/lib/api/projects";

export const dynamic = "force-dynamic";

interface SettingsPageProps {
	params: Promise<{
		tenantId: string;
		projectId: string;
	}>;
}

export default async function SettingsPage({ params }: SettingsPageProps) {
	const { tenantId, projectId } = await params;
	const projectData = await fetchProject(tenantId, projectId);
	return (
		<BodyTemplate
			breadcrumbs={[
				{
					label: "Project Settings",
				},
				{ label: projectData.data.name },
			]}
		>
			<MainContent>
				<div className="max-w-2xl mx-auto py-4">
					<ProjectForm
						projectId={projectData.data.id || projectData.data.projectId}
						initialData={{
							...projectData.data,
							id: projectData.data.id || projectData.data.projectId,
						}}
						tenantId={tenantId}
					/>
				</div>
			</MainContent>
		</BodyTemplate>
	);
}
