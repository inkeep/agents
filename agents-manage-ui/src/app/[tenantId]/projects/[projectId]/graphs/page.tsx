import { GraphList } from "@/components/graphs/graph-list";
import { GraphsIcon } from "@/components/icons/empty-state/graphs";
import { BodyTemplate } from "@/components/layout/body-template";
import EmptyState from "@/components/layout/empty-state";
import { MainContent } from "@/components/layout/main-content";
import { PageHeader } from "@/components/layout/page-header";
import { graphDescription } from "@/constants/page-descriptions";
import { fetchGraphs } from "@/lib/api/graph-full-client";
import type { Graph } from "@/lib/types/graph-full";

export const dynamic = "force-dynamic";

interface GraphsPageProps {
	params: Promise<{ tenantId: string; projectId: string }>;
}

async function GraphsPage({ params }: GraphsPageProps) {
	const { tenantId, projectId } = await params;
	let graphs: { data: Graph[] } = { data: [] };
	try {
		const response = await fetchGraphs(tenantId, projectId);
		graphs = response;
	} catch (_error) {
		throw new Error("Failed to fetch graphs");
	}
	return (
		<BodyTemplate
			breadcrumbs={[
				{ label: "Graphs", href: `/${tenantId}/projects/${projectId}/graphs` },
			]}
		>
			<MainContent className="min-h-full">
				{graphs.data.length > 0 ? (
					<>
						<PageHeader title="Graphs" description={graphDescription} />
						<GraphList
							tenantId={tenantId}
							projectId={projectId}
							graphs={graphs.data}
						/>
					</>
				) : (
					<EmptyState
						title="No graphs yet."
						description={graphDescription}
						link={`/${tenantId}/projects/${projectId}/graphs/new`}
						linkText="Create graph"
						icon={<GraphsIcon />}
					/>
				)}
			</MainContent>
		</BodyTemplate>
	);
}

export default GraphsPage;
