import { notFound } from "next/navigation";
import {
	EditCredentialForm,
	type EditCredentialFormData,
} from "@/components/credentials/views/edit-credential-form";
import { BodyTemplate } from "@/components/layout/body-template";
import { MainContent } from "@/components/layout/main-content";
import { type Credential, fetchCredential } from "@/lib/api/credentials";
import { getNangoConnectionMetadata } from "@/lib/mcp-tools/nango";

async function credentialToFormData(
	credential: Credential,
): Promise<EditCredentialFormData> {
	let connectionMetadata: Record<string, string> = {};
	if (
		credential.retrievalParams?.providerConfigKey &&
		credential.retrievalParams?.connectionId
	) {
		connectionMetadata =
			(await getNangoConnectionMetadata({
				providerConfigKey: credential.retrievalParams
					.providerConfigKey as string,
				connectionId: credential.retrievalParams.connectionId as string,
			})) || {};
	}

	return {
		name: credential.id,
		metadata: connectionMetadata,
	};
}

async function EditCredentialsPage({
	params,
}: {
	params: Promise<{
		tenantId: string;
		projectId: string;
		credentialId: string;
	}>;
}) {
	const { tenantId, projectId, credentialId } = await params;

	try {
		// Fetch credential data on the server
		const credential = await fetchCredential(tenantId, projectId, credentialId);
		const initialFormData = await credentialToFormData(credential);

		return (
			<BodyTemplate
				breadcrumbs={[
					{
						label: "Credentials",
						href: `/${tenantId}/projects/${projectId}/credentials`,
					},
					{ label: "Edit" },
				]}
			>
				<MainContent>
					<div className="max-w-2xl mx-auto py-4">
						<EditCredentialForm
							tenantId={tenantId}
							projectId={projectId}
							credential={credential}
							initialFormData={initialFormData}
						/>
					</div>
				</MainContent>
			</BodyTemplate>
		);
	} catch (error) {
		console.error("Failed to fetch credential:", error);
		notFound();
	}
}

export default EditCredentialsPage;
