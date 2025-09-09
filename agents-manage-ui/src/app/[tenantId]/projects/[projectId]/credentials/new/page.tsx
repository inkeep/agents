import { Search, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { BodyTemplate } from "@/components/layout/body-template";
import { MainContent } from "@/components/layout/main-content";
import { PageHeader } from "@/components/layout/page-header";
import { CardDescription, CardTitle } from "@/components/ui/card";
import { ItemCardGrid } from "@/components/ui/item-card-grid";

interface CredentialOption {
	id: string;
	icon: ReactNode;
	title: string;
	description: string;
	href: string;
}

async function NewCredentialsPage({
	params,
}: {
	params: Promise<{ tenantId: string; projectId: string }>;
}) {
	const { tenantId, projectId } = await params;
	const credentialOptions: CredentialOption[] = [
		{
			id: "providers",
			icon: (
				<Search className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
			),
			title: "Browse Providers",
			description:
				"Connect to popular providers like GitHub, Google Drive, Slack, and more. This is useful when you want to give MCP Servers access to your providers.",
			href: `/${tenantId}/projects/${projectId}/credentials/new/providers`,
		},
		{
			id: "bearer",
			icon: (
				<Settings className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
			),
			title: "Bearer Authentication",
			description:
				"Create a bearer token for API authentication. Useful when you need to provide secure access tokens to your MCP Servers.",
			href: `/${tenantId}/projects/${projectId}/credentials/new/bearer`,
		},
	];

	const renderCredentialHeader = (option: CredentialOption) => (
		<div className="flex items-center gap-3">
			{option.icon}
			<div className="flex-1 min-w-0">
				<CardTitle className="text-sm truncate font-medium">
					{option.title}
				</CardTitle>
			</div>
		</div>
	);

	const renderCredentialContent = (option: CredentialOption) => (
		<CardDescription className="text-sm text-muted-foreground">
			{option.description}
		</CardDescription>
	);

	return (
		<BodyTemplate
			breadcrumbs={[
				{
					label: "Credentials",
					href: `/${tenantId}/projects/${projectId}/credentials`,
				},
				{ label: "New Credential" },
			]}
		>
			<MainContent>
				<PageHeader
					title="New Credential"
					description="Create credentials for your MCP servers"
				/>
				<ItemCardGrid
					items={credentialOptions}
					getKey={(option) => option.id}
					getHref={(option) => option.href}
					renderHeader={renderCredentialHeader}
					renderContent={renderCredentialContent}
				/>
			</MainContent>
		</BodyTemplate>
	);
}

export default NewCredentialsPage;
