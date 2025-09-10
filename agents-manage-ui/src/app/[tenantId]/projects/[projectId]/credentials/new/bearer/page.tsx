import { NewCredentialForm } from "@/components/credentials/views/new-credential-form";
import { BodyTemplate } from "@/components/layout/body-template";
import { MainContent } from "@/components/layout/main-content";

async function NewBearerCredentialsPage({
	params,
}: {
	params: Promise<{ tenantId: string; projectId: string }>;
}) {
	const { tenantId, projectId } = await params;
	return (
		<BodyTemplate
			breadcrumbs={[
				{
					label: "Credentials",
					href: `/${tenantId}/projects/${projectId}/credentials`,
				},
				{
					label: "New Credential",
					href: `/${tenantId}/projects/${projectId}/credentials/new`,
				},
				{ label: "Bearer" },
			]}
		>
			<MainContent>
				<div className="max-w-2xl mx-auto py-4">
					<NewCredentialForm />
				</div>
			</MainContent>
		</BodyTemplate>
	);
}

export default NewBearerCredentialsPage;
