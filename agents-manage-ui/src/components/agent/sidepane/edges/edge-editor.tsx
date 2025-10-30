import { type Edge, useNodesData, useReactFlow } from '@xyflow/react';
import { Spline } from 'lucide-react';
import { DashedSplineIcon } from '@/components/icons/dashed-spline';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useAgentActions } from '@/features/agent/state/use-agent-store';
import type { A2AEdgeData } from '../../configuration/edge-types';

type RelationshipOptionProps = {
  id: string;
  label: string | React.ReactNode;
  onCheckedChange: (id: string, checked: boolean) => void;
  checked: boolean;
  disabled?: boolean;
  disabledReason?: string;
};

function RelationshipOption({ id, label, onCheckedChange, checked, disabled, disabledReason }: RelationshipOptionProps) {
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id={id}
        onCheckedChange={(checked) => onCheckedChange(id, checked as boolean)}
        checked={checked}
        disabled={disabled}
        className="mt-[5px]"
      />
      <div className="grid gap-2">
        <Label htmlFor={id} className={`font-normal ${disabled ? 'text-muted-foreground' : ''}`}>
          {label}
        </Label>
        {disabled && disabledReason && (
          <p className="text-xs text-muted-foreground">{disabledReason}</p>
        )}
      </div>
    </div>
  );
}

type RelationshipSectionProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  options: Array<{ id: string; label: string | React.ReactNode; disabled?: boolean; disabledReason?: string }>;
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
          disabled={option.disabled}
          disabledReason={option.disabledReason}
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
  const { markUnsaved } = useAgentActions();

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
      const currentRelationships = selectedEdge.data?.relationships as A2AEdgeData['relationships'];
      
      // Prevent two-way delegation: if enabling a delegation, automatically disable the reverse
      if (checked && id === 'delegateSourceToTarget' && currentRelationships?.delegateTargetToSource) {
        newRelationships = {
          ...currentRelationships,
          delegateSourceToTarget: true,
          delegateTargetToSource: false,
        };
      } else if (checked && id === 'delegateTargetToSource' && currentRelationships?.delegateSourceToTarget) {
        newRelationships = {
          ...currentRelationships,
          delegateSourceToTarget: false,
          delegateTargetToSource: true,
        };
      } else {
        newRelationships = {
          ...currentRelationships,
          [id]: checked,
        };
      }
    }

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
      updateEdgeData(selectedEdge.id, {
        relationships: newRelationships,
      });
    }
  };

  const sourceName =
    (sourceNode?.data.name as string) || (sourceNode?.data.id as string) || 'Sub Agent';
  const targetName =
    (targetNode?.data.name as string) || (targetNode?.data.id as string) || 'Sub Agent';

  const transferOptions = isSelfLoop
    ? [
        {
          id: 'transferSourceToTarget',
          label: (
            <div>
              <Badge variant="code" className="my-0.5">
                {sourceName}
              </Badge>{' '}
              can transfer to itself
            </div>
          ),
        },
      ]
    : [
        {
          id: 'transferSourceToTarget',
          label: (
            <div>
              <Badge variant="code" className="my-0.5">
                {sourceName}
              </Badge>{' '}
              can transfer to{' '}
              <Badge variant="code" className="my-0.5">
                {targetName}
              </Badge>
            </div>
          ),
        },
        {
          id: 'transferTargetToSource',
          label: (
            <div>
              <Badge variant="code" className="my-0.5">
                {targetName}
              </Badge>{' '}
              can transfer to{' '}
              <Badge variant="code" className="my-0.5">
                {sourceName}
              </Badge>
            </div>
          ),
        },
      ];

  const currentRelationships = selectedEdge.data?.relationships as A2AEdgeData['relationships'];
  const hasSourceToTargetDelegate = currentRelationships?.delegateSourceToTarget;
  const hasTargetToSourceDelegate = currentRelationships?.delegateTargetToSource;

  const delegateOptions = isSelfLoop
    ? [
        {
          id: 'delegateSourceToTarget',
          label: (
            <div>
              <Badge variant="code" className="my-0.5">
                {sourceName}
              </Badge>{' '}
              can delegate to itself
            </div>
          ),
        },
      ]
    : [
        {
          id: 'delegateSourceToTarget',
          label: (
            <div>
              <Badge variant="code" className="my-0.5">
                {sourceName}
              </Badge>{' '}
              can delegate to{' '}
              <Badge variant="code" className="my-0.5">
                {targetName}
              </Badge>
            </div>
          ),
          disabled: hasTargetToSourceDelegate,
          disabledReason: hasTargetToSourceDelegate ? 'Two-way delegation is not allowed. Uncheck the reverse delegation first.' : undefined,
        },
        {
          id: 'delegateTargetToSource',
          label: (
            <div>
              <Badge variant="code" className="my-0.5">
                {targetName}
              </Badge>{' '}
              can delegate to{' '}
              <Badge variant="code" className="my-0.5">
                {sourceName}
              </Badge>
            </div>
          ),
          disabled: hasSourceToTargetDelegate,
          disabledReason: hasSourceToTargetDelegate ? 'Two-way delegation is not allowed. Uncheck the reverse delegation first.' : undefined,
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
