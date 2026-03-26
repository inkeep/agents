'use client';

import { Loader2 } from 'lucide-react';
import React from 'react';
import { ComponentSelector } from '@/components/agent/sidepane/nodes/component-selector/component-selector';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useDatasetsQuery } from '@/lib/query/datasets';
import { useEvaluatorsQuery } from '@/lib/query/evaluators';

interface ImprovementTriggerDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (selection: {
    datasetIds: string[];
    evaluatorIds: string[];
  }) => void;
  isSubmitting: boolean;
  tenantId: string;
  projectId: string;
}

export function ImprovementTriggerDialog({
  isOpen,
  onOpenChange,
  onConfirm,
  isSubmitting,
  tenantId,
  projectId,
}: ImprovementTriggerDialogProps) {
  const [selectedDatasetIds, setSelectedDatasetIds] = React.useState<string[]>([]);
  const [selectedEvaluatorIds, setSelectedEvaluatorIds] = React.useState<string[]>([]);

  const { data: datasets = [], isLoading: loadingDatasets } = useDatasetsQuery();
  const { data: evaluators = [], isLoading: loadingEvaluators } = useEvaluatorsQuery();

  const datasetLookup = React.useMemo(
    () => Object.fromEntries(datasets.map((d) => [d.id, { id: d.id, name: d.name ?? d.id }])),
    [datasets]
  );
  const evaluatorLookup = React.useMemo(
    () => Object.fromEntries(evaluators.map((e) => [e.id, { id: e.id, name: e.name ?? e.id }])),
    [evaluators]
  );

  React.useEffect(() => {
    if (!isOpen) {
      setSelectedDatasetIds([]);
      setSelectedEvaluatorIds([]);
    }
  }, [isOpen]);

  const handleConfirm = () => {
    onConfirm({
      datasetIds: selectedDatasetIds,
      evaluatorIds: selectedEvaluatorIds,
    });
  };

  const hasNoEvalResources = datasets.length === 0 && evaluators.length === 0;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Configure Improvement Run</DialogTitle>
          <DialogDescription>
            Select which datasets and evaluators to use for baseline evaluation. The target agent is
            automatically resolved from the conversation. Leave empty to skip evaluation.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5 py-2">
          {!hasNoEvalResources && (
            <>
              <div className="flex flex-col gap-2">
                <Label>Datasets</Label>
                {loadingDatasets ? (
                  <p className="text-sm text-muted-foreground">Loading datasets...</p>
                ) : datasets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No datasets available. Evaluation will be skipped.
                  </p>
                ) : (
                  <ComponentSelector
                    label=""
                    componentLookup={datasetLookup}
                    selectedComponents={selectedDatasetIds}
                    onSelectionChange={setSelectedDatasetIds}
                    emptyStateMessage="No datasets available."
                    emptyStateActionText="Create dataset"
                    emptyStateActionHref={`/${tenantId}/projects/${projectId}/datasets`}
                    placeholder="Select datasets for baseline eval..."
                  />
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label>Evaluators</Label>
                {loadingEvaluators ? (
                  <p className="text-sm text-muted-foreground">Loading evaluators...</p>
                ) : evaluators.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No evaluators available. Evaluation will be skipped.
                  </p>
                ) : (
                  <ComponentSelector
                    label=""
                    componentLookup={evaluatorLookup}
                    selectedComponents={selectedEvaluatorIds}
                    onSelectionChange={setSelectedEvaluatorIds}
                    emptyStateMessage="No evaluators available."
                    emptyStateActionText="Create evaluator"
                    emptyStateActionHref={`/${tenantId}/projects/${projectId}/evaluations?tab=evaluators`}
                    placeholder="Select evaluators for baseline eval..."
                  />
                )}
              </div>
            </>
          )}

          {hasNoEvalResources && (
            <p className="text-sm text-muted-foreground">
              No datasets or evaluators found in this project. The improvement agent will skip
              baseline evaluation and proceed directly to making changes.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              'Start Improvement'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
