import { BodyTemplate } from "@/components/layout/body-template";
import { MainContent } from "@/components/layout/main-content";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { artifactDescription } from "@/constants/page-descriptions";

export default function Loading() {
	return (
		<BodyTemplate breadcrumbs={[{ label: "Artifact components" }]}>
			<MainContent>
				<PageHeader
					title="Artifact components"
					description={artifactDescription}
				/>
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
					{Array.from({ length: 6 }).map((_, i) => (
						<Skeleton
							key={`loading-artifact-${i}`}
							className="h-36 w-full rounded-lg"
						/>
					))}
				</div>
			</MainContent>
		</BodyTemplate>
	);
}
