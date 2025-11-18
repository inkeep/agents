'use client';

import { ExpandableJsonEditor } from '@/components/editors/expandable-json-editor';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import type { Evaluator } from '@/lib/api/evaluators';

interface EvaluatorViewDialogProps {
  evaluator: Evaluator;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EvaluatorViewDialog({ evaluator, isOpen, onOpenChange }: EvaluatorViewDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[80vw] w-[80vw] max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>View Evaluator</DialogTitle>
          <DialogDescription>View the evaluator configuration details.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Name */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Name</Label>
            <div className="bg-muted rounded-md p-3">
              <span className="text-sm">{evaluator.name}</span>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Description</Label>
            <div className="bg-muted rounded-md p-3">
              <span className="text-sm">{evaluator.description || 'No description'}</span>
            </div>
          </div>

          {/* Prompt */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Prompt</Label>
            <div className="bg-muted rounded-md p-3">
              <pre className="text-sm whitespace-pre-wrap break-words font-mono">
                {evaluator.prompt}
              </pre>
            </div>
          </div>

          {/* Schema */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Output Schema</Label>
            <ExpandableJsonEditor
              name="schema"
              value={JSON.stringify(evaluator.schema, null, 2)}
              onChange={() => {}}
            />
          </div>

          {/* Model */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Model</Label>
            <div className="bg-muted rounded-md p-3">
              <div className="space-y-2">
                <div>
                  <span className="text-xs text-muted-foreground">Model: </span>
                  <span className="text-sm font-medium">
                    {evaluator.model?.model || 'Not specified'}
                  </span>
                </div>
                {evaluator.model?.providerOptions &&
                  Object.keys(evaluator.model.providerOptions).length > 0 && (
                    <div className="mt-2">
                      <Label className="text-xs text-muted-foreground">Provider Options</Label>
                      <ExpandableJsonEditor
                        name="providerOptions"
                        value={JSON.stringify(evaluator.model.providerOptions, null, 2)}
                        onChange={() => {}}
                      />
                    </div>
                  )}
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
