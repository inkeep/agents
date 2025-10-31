import { type Edge, useNodesData, useReactFlow } from '@xyflow/react';
import { Spline, Trash2 } from 'lucide-react';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { DashedSplineIcon } from '@/components/icons/dashed-spline';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { useAgentActions } from '@/features/agent/state/use-agent-store';
import { getCycleErrorMessage, wouldCreateCycle } from '@/lib/utils/cycle-detection';
import type { A2AEdgeData } from '../../configuration/edge-types';

type RelationshipOptionProps = {
  id: string;
  label: string | React.ReactNode;
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
        className="mt-[5px]"
      />
      <div className="grid gap-2">
        <Label htmlFor={id} className="font-normal">
          {label}
        </Label>
      </div>
    </div>
  );
}

type RelationshipSectionProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  options: Array<{ id: string; label: string | React.ReactNode }>;
  onCheckedChange: (id: string, checked: boolean) => void;
  checkedValues: A2AEdgeData['relationships'];
  useRadio?: boolean;
  onRadioChange?: (value: string) => void;
};

function RelationshipSection({
  icon,
  title,
  description,
  options,
  onCheckedChange,
  checkedValues,
  useRadio = false,
  onRadioChange,
}: RelationshipSectionProps) {
  const getRadioValue = () => {
    const checkedOption = options.find(
      (opt) => checkedValues?.[opt.id as keyof A2AEdgeData['relationships']],
    );
    return checkedOption?.id || '';
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="font-semibold text-sm">{title}</h3>
        </div>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      {useRadio && onRadioChange ? (
        <RadioGroup value={getRadioValue()} onValueChange={onRadioChange}>
          {options.map((option) => (
            <div key={option.id} className="flex items-start gap-3">
              <RadioGroupItem value={option.id} id={option.id} className="mt-[5px]" />
              <div className="grid gap-2">
                <Label htmlFor={option.id} className="font-normal">
                  {option.label}
                </Label>
              </div>
            </div>
          ))}
        </RadioGroup>
      ) : (
        options.map((option) => (
          <RelationshipOption
            key={option.id}
            id={option.id}
            label={option.label}
            onCheckedChange={onCheckedChange}
            checked={checkedValues?.[option.id as keyof A2AEdgeData['relationships']] || false}
          />
        ))
      )}
    </div>
  );
}

interface EdgeEditorProps {
  selectedEdge: Edge;
}

function EdgeEditor({ selectedEdge }: EdgeEditorProps) {
  const { updateEdgeData, setEdges, deleteElements, getEdges } = useReactFlow();

  const deleteEdge = useCallback(() => {
    deleteElements({ edges: [{ id: selectedEdge.id }] });
  }, [selectedEdge.id, deleteElements]);

  const sourceNode = useNodesData(selectedEdge.source);
  const targetNode = useNodesData(selectedEdge.target);
  const { markUnsaved } = useAgentActions();

  const isSelfLoop = selectedEdge.source === selectedEdge.target;

  const checkForCycle = (delegateId: string): boolean => {
    const source = delegateId === 'delegateSourceToTarget' ? selectedEdge.source : selectedEdge.target;
    const target = delegateId === 'delegateSourceToTarget' ? selectedEdge.target : selectedEdge.source;
    
    const allEdges = getEdges();
    const otherEdges = allEdges.filter((edge) => edge.id !== selectedEdge.id);
    
    if (wouldCreateCycle(otherEdges, { source, target })) {
      const sourceName = (sourceNode?.data.name as string) || (sourceNode?.data.id as string) || 'Sub Agent';
      const targetName = (targetNode?.data.name as string) || (targetNode?.data.id as string) || 'Sub Agent';
      const sourceLabel = delegateId === 'delegateSourceToTarget' ? sourceName : targetName;
      const targetLabel = delegateId === 'delegateSourceToTarget' ? targetName : sourceName;
      
      toast.error('Circular Delegation Detected', {
        description: getCycleErrorMessage(sourceLabel, targetLabel),
      });
      return true;
    }
    return false;
  };

  const updateRelationships = (newRelationships: A2AEdgeData['relationships']) => {
    const hasAnyRelationship =
      newRelationships.transferSourceToTarget ||
      newRelationships.transferTargetToSource ||
      newRelationships.delegateSourceToTarget ||
      newRelationships.delegateTargetToSource;

    markUnsaved();

    if (!hasAnyRelationship) {
      setEdges((edges) => edges.filter((edge) => edge.id !== selectedEdge.id));
    } else {
      updateEdgeData(selectedEdge.id, { relationships: newRelationships });
    }
  };

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
      const updates: Partial<A2AEdgeData['relationships']> = { [id]: checked };
      
      // Prevent two-way delegation: when enabling one delegation direction, disable the opposite
      if (checked) {
        if (id === 'delegateSourceToTarget') {
          updates.delegateTargetToSource = false;
        } else if (id === 'delegateTargetToSource') {
          updates.delegateSourceToTarget = false;
        }
      }
      
      newRelationships = {
        ...(selectedEdge.data?.relationships as A2AEdgeData['relationships']),
        ...updates,
      };
    }

    updateRelationships(newRelationships);
  };

  const handleDelegateRadioChange = (value: string) => {
    if (value && checkForCycle(value)) return;

    const newRelationships: A2AEdgeData['relationships'] = {
      ...(selectedEdge.data?.relationships as A2AEdgeData['relationships']),
      delegateSourceToTarget: false,
      delegateTargetToSource: false,
    };

    if (value) {
      if (isSelfLoop && value === 'delegateSourceToTarget') {
        newRelationships.delegateSourceToTarget = true;
        newRelationships.delegateTargetToSource = true;
      } else {
        newRelationships[value as keyof A2AEdgeData['relationships']] = true;
      }
    }

    updateRelationships(newRelationships);
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
        description="Delegate relationships are used to pass a task from one agent to another. Delegate relationships cannot be bi-directional."
        options={delegateOptions}
        onCheckedChange={handleCheckboxChange}
        checkedValues={selectedEdge.data?.relationships as A2AEdgeData['relationships']}
        useRadio={true}
        onRadioChange={handleDelegateRadioChange}
      />
      <Separator />
      <div className="flex justify-end">
        <Button variant="destructive-outline" size="sm" onClick={deleteEdge}>
          <Trash2 className="size-4" />
          Delete
        </Button>
      </div>
    </div>
  );
}

export default EdgeEditor;
