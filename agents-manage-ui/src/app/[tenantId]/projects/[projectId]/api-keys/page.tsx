import { ApiKeysTable } from "@/components/api-keys/api-keys-table";
import { NewApiKeyDialog } from "@/components/api-keys/new-api-key-dialog";
import type { SelectOption } from "@/components/form/generic-select";
import { BodyTemplate } from "@/components/layout/body-template";
import { MainContent } from "@/components/layout/main-content";
import { PageHeader } from "@/components/layout/page-header";
import { apiKeyDescription } from "@/constants/page-descriptions";
import { fetchApiKeys } from "@/lib/api/api-keys";
import { fetchGraphs } from "@/lib/api/graph-full-client";
import type { Graph } from "@/lib/types/graph-full";
import { createLookup } from "@/lib/utils";

export const dynamic = "force-dynamic";

const createGraphOptions = (graphs: Graph[]): SelectOption[] => {
	return graphs.map((graph) => ({
		value: graph.id,
		label: graph.name,
	}));
};

interface ApiKeysPageProps {
	params: Promise<{ tenantId: string; projectId: string }>;
}

async function ApiKeysPage({ params }: ApiKeysPageProps) {
	const { tenantId, projectId } = await params;
	const [apiKeys, graphs] = await Promise.all([
		fetchApiKeys(tenantId, projectId),
		fetchGraphs(tenantId, projectId),
	]);

	const graphLookup = createLookup(graphs.data);
	const graphOptions = createGraphOptions(graphs.data);
	return (
		<BodyTemplate
			breadcrumbs={[
				{
					label: "API keys",
					href: `/${tenantId}/projects/${projectId}/api-keys`,
				},
			]}
		>
			<MainContent className="min-h-full">
				<PageHeader
					title="API keys"
					description={apiKeyDescription}
					action={
						<NewApiKeyDialog
							tenantId={tenantId}
							projectId={projectId}
							graphsOptions={graphOptions}
						/>
					}
				/>
				<ApiKeysTable apiKeys={apiKeys.data} graphLookup={graphLookup} />
			</MainContent>
		</BodyTemplate>
	);
}

export default ApiKeysPage;
