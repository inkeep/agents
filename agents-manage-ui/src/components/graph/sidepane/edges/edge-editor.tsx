import { type Edge, useNodesData, useReactFlow } from "@xyflow/react";
import { Spline } from "lucide-react";
import { DashedSplineIcon } from "@/components/icons/dashed-spline";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useGraphStore } from "@/features/graph/state/use-graph-store";
import type { A2AEdgeData } from "../../configuration/edge-types";

type RelationshipOptionProps = {
	id: string;
	label: string;
	onCheckedChange: (id: string, checked: boolean) => void;
	checked: boolean;
};

function RelationshipOption({
	id,
	label,
	onCheckedChange,
	checked,
}: RelationshipOptionProps) {
	return (
		<div className="flex items-start gap-3">
			<Checkbox
				id={id}
				onCheckedChange={(checked) => onCheckedChange(id, checked as boolean)}
				checked={checked}
			/>
			<div className="grid gap-2">
				<Label htmlFor={id}>{label}</Label>
			</div>
		</div>
	);
}

type RelationshipSectionProps = {
	icon: React.ReactNode;
	title: string;
	description: string;
	options: Array<{ id: string; label: string }>;
	onCheckedChange: (id: string, checked: boolean) => void;
	checkedValues: A2AEdgeData["relationships"];
};

function RelationshipSection({
	icon,
	title,
	description,
	options,
	onCheckedChange,
	checkedValues,
}: RelationshipSectionProps) {
	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<div className="flex items-center gap-2">
					{icon}
					<h3 className="font-semibold text-sm">{title}</h3>
				</div>
				<p className="text-muted-foreground text-sm">{description}</p>
			</div>
			{options.map((option) => (
				<RelationshipOption
					key={option.id}
					id={option.id}
					label={option.label}
					onCheckedChange={onCheckedChange}
					checked={
						checkedValues?.[option.id as keyof A2AEdgeData["relationships"]] ||
						false
					}
				/>
			))}
		</div>
	);
}

interface EdgeEditorProps {
	selectedEdge: Edge;
}

function EdgeEditor({ selectedEdge }: EdgeEditorProps) {
	const { updateEdgeData } = useReactFlow();
	const sourceNode = useNodesData(selectedEdge.source);
	const targetNode = useNodesData(selectedEdge.target);
	const markUnsaved = useGraphStore((state) => state.markUnsaved);

	const handleCheckboxChange = (id: string, checked: boolean) => {
		updateEdgeData(selectedEdge.id, {
			relationships: {
				...(selectedEdge.data?.relationships as A2AEdgeData["relationships"]),
				[id]: checked,
			},
		});
		markUnsaved();
	};

	const transferOptions = [
		{
			id: "transferSourceToTarget",
			label: `${sourceNode?.data.name} can transfer to ${targetNode?.data.name}`,
		},
		{
			id: "transferTargetToSource",
			label: `${targetNode?.data.name} can transfer to ${sourceNode?.data.name}`,
		},
	];

	const delegateOptions = [
		{
			id: "delegateSourceToTarget",
			label: `${sourceNode?.data.name} can delegate to ${targetNode?.data.name}`,
		},
		{
			id: "delegateTargetToSource",
			label: `${targetNode?.data.name} can delegate to ${sourceNode?.data.name}`,
		},
	];

	return (
		<div className="space-y-8">
			<RelationshipSection
				icon={<Spline className="w-4 h-4 text-muted-foreground" />}
				title="Transfer relationships"
				description="Transfer relationships completely relinquish control from one agent to another."
				options={transferOptions}
				onCheckedChange={handleCheckboxChange}
				checkedValues={
					selectedEdge.data?.relationships as A2AEdgeData["relationships"]
				}
			/>
			<hr />
			<RelationshipSection
				icon={<DashedSplineIcon className="w-4 h-4 text-muted-foreground" />}
				title="Delegate relationships"
				description="Delegate relationships are used to pass a task from one agent to another."
				options={delegateOptions}
				onCheckedChange={handleCheckboxChange}
				checkedValues={
					selectedEdge.data?.relationships as A2AEdgeData["relationships"]
				}
			/>
		</div>
	);
}

export default EdgeEditor;
