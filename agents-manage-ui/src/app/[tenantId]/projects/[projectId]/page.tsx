import { redirect } from "next/navigation";

async function ProjectPage({
	params,
}: {
	params: Promise<{ tenantId: string; projectId: string }>;
}) {
	const { tenantId, projectId } = await params;
	redirect(`/${tenantId}/projects/${projectId}/graphs`);
}

export default ProjectPage;
