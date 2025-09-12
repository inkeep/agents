import { type Edge, useNodesData, useReactFlow } from '@xyflow/react';
import { Spline } from 'lucide-react';
import { DashedSplineIcon } from '@/components/icons/dashed-spline';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useGraphStore } from '@/features/graph/state/use-graph-store';
import type { A2AEdgeData } from '../../configuration/edge-types';

type RelationshipOptionProps = {
  id: string;
  label: string;
  onCheckedChange: (id: string, checked: boolean) => void;
  checked: boolean;
};

function RelationshipOption({ id, label, onCheckedChange, checked }: RelationshipOptionProps) {
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
  checkedValues: A2AEdgeData['relationships'];
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
          checked={checkedValues?.[option.id as keyof A2AEdgeData['relationships']] || false}
        />
      ))}
    </div>
  );
}

interface EdgeEditorProps {
  selectedEdge: Edge;
}

function EdgeEditor({ selectedEdge }: EdgeEditorProps) {
  const { updateEdgeData, setEdges } = useReactFlow();
  const sourceNode = useNodesData(selectedEdge.source);
  const targetNode = useNodesData(selectedEdge.target);
  const markUnsaved = useGraphStore((state) => state.markUnsaved);

  // Check if this is a self-loop (source and target are the same)
  const isSelfLoop = selectedEdge.source === selectedEdge.target;

  const handleCheckboxChange = (id: string, checked: boolean) => {
    // Calculate the new relationships state
    let newRelationships: A2AEdgeData['relationships'];

    if (isSelfLoop) {
      // For self-loops, when we toggle the checkbox, we should set both directions
      // to maintain consistency (a self-loop is inherently bidirectional)
      const updates: Partial<A2AEdgeData['relationships']> = {};
      if (id === 'transferSourceToTarget') {
        updates.transferSourceToTarget = checked;
        updates.transferTargetToSource = checked;
      } else if (id === 'delegateSourceToTarget') {
        updates.delegateSourceToTarget = checked;
        updates.delegateTargetToSource = checked;
      }
      newRelationships = {
        ...(selectedEdge.data?.relationships as A2AEdgeData['relationships']),
        ...updates,
      };
    } else {
      newRelationships = {
        ...(selectedEdge.data?.relationships as A2AEdgeData['relationships']),
        [id]: checked,
      };
    }

    // Check if all relationships are now unchecked
    const hasAnyRelationship =
      newRelationships.transferSourceToTarget ||
      newRelationships.transferTargetToSource ||
      newRelationships.delegateSourceToTarget ||
      newRelationships.delegateTargetToSource;

    // Always mark as unsaved when relationships change
    markUnsaved();

    if (!hasAnyRelationship) {
      // Remove the edge if no relationships remain
      setEdges((edges) => edges.filter((edge) => edge.id !== selectedEdge.id));
    } else {
      // Update the edge data with the new relationships
      updateEdgeData(selectedEdge.id, {
        relationships: newRelationships,
      });
    }
  };

  const transferOptions = isSelfLoop
    ? [
        {
          id: 'transferSourceToTarget',
          label: `${sourceNode?.data.name} can transfer to itself`,
        },
      ]
    : [
        {
          id: 'transferSourceToTarget',
          label: `${sourceNode?.data.name} can transfer to ${targetNode?.data.name}`,
        },
        {
          id: 'transferTargetToSource',
          label: `${targetNode?.data.name} can transfer to ${sourceNode?.data.name}`,
        },
      ];

  const delegateOptions = isSelfLoop
    ? [
        {
          id: 'delegateSourceToTarget',
          label: `${sourceNode?.data.name} can delegate to itself`,
        },
      ]
    : [
        {
          id: 'delegateSourceToTarget',
          label: `${sourceNode?.data.name} can delegate to ${targetNode?.data.name}`,
        },
        {
          id: 'delegateTargetToSource',
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
        checkedValues={selectedEdge.data?.relationships as A2AEdgeData['relationships']}
      />
      <hr />
      <RelationshipSection
        icon={<DashedSplineIcon className="w-4 h-4 text-muted-foreground" />}
        title="Delegate relationships"
        description="Delegate relationships are used to pass a task from one agent to another."
        options={delegateOptions}
        onCheckedChange={handleCheckboxChange}
        checkedValues={selectedEdge.data?.relationships as A2AEdgeData['relationships']}
      />
    </div>
  );
}

export default EdgeEditor;
