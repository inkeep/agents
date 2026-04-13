'use client';

import { AlertTriangle, ArrowLeft, Check, Loader2, RefreshCw, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { mergeImprovementAction, rejectImprovementAction } from '@/lib/actions/improvements';
import type { ConflictItem, ConflictResolution, ImprovementDiffResponse } from '@/lib/api/improvements';
import { ImprovementDiffView } from './improvement-diff-view';
import { ImprovementEvalResults } from './improvement-eval-results';

interface ImprovementBranchViewProps {
  tenantId: string;
  projectId: string;
  diff: ImprovementDiffResponse;
  branchName: string;
  isNewRun: boolean;
  agentStatus?: string;
}

export function ImprovementBranchView({
  tenantId,
  projectId,
  diff,
  branchName,
  isNewRun,
  agentStatus,
}: ImprovementBranchViewProps) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
  const [resolutions, setResolutions] = useState<Record<string, 'ours' | 'theirs'>>({});
  const [showConflictDialog, setShowConflictDialog] = useState(false);

  const isRunning = agentStatus === 'running' || (isNewRun && !agentStatus);
  const isCompleted = agentStatus === 'completed';
  const isFailed = agentStatus === 'failed';

  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      router.refresh();
    }, 8_000);

    const initialDelay = setTimeout(() => {
      router.refresh();
    }, 3_000);

    return () => {
      clearInterval(interval);
      clearTimeout(initialDelay);
    };
  }, [isRunning, router]);

  const handleRefresh = () => {
    router.refresh();
  };

  const conflictKey = (c: ConflictItem) =>
    `${c.table}::${Object.values(c.primaryKey).join('::')}`;

  const handleMerge = async (withResolutions?: ConflictResolution[]) => {
    setLoadingAction('merge');
    const result = await mergeImprovementAction(
      tenantId,
      projectId,
      branchName,
      withResolutions
    );
    if (result.success) {
      setShowConflictDialog(false);
      toast.success('Improvement merged successfully');
      router.push(`/${tenantId}/projects/${projectId}/improvements`);
    } else if (result.code === 'conflict' && result.conflicts && result.conflicts.length > 0) {
      setConflicts(result.conflicts);
      const defaults: Record<string, 'ours' | 'theirs'> = {};
      for (const c of result.conflicts) {
        defaults[conflictKey(c)] = 'ours';
      }
      setResolutions(defaults);
      setShowConflictDialog(true);
    } else {
      toast.error(result.error ?? 'Failed to merge');
    }
    setLoadingAction(null);
  };

  const handleResolveAndMerge = async () => {
    const resolved: ConflictResolution[] = conflicts.map((c) => ({
      table: c.table,
      primaryKey: c.primaryKey,
      rowDefaultPick: resolutions[conflictKey(c)] ?? 'ours',
    }));
    await handleMerge(resolved);
  };

  const handleReject = async () => {
    setLoadingAction('reject');
    const result = await rejectImprovementAction(tenantId, projectId, branchName);
    if (result.success) {
      toast.success('Improvement rejected');
      router.push(`/${tenantId}/projects/${projectId}/improvements`);
    } else {
      toast.error(result.error ?? 'Failed to reject');
    }
    setLoadingAction(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href={`/${tenantId}/projects/${projectId}/improvements`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Improvements
          </Button>
        </Link>

        <div className="flex items-center gap-2">
          {isRunning && (
            <Badge variant="secondary" className="gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Agent running...
            </Badge>
          )}
          {isCompleted && (
            <Badge variant="default" className="gap-1.5">
              <Check className="h-3 w-3" />
              Completed
            </Badge>
          )}
          {isFailed && (
            <Badge variant="destructive" className="gap-1.5">
              <XCircle className="h-3 w-3" />
              Failed
            </Badge>
          )}

          <Button size="sm" variant="ghost" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => handleMerge()}
            disabled={loadingAction !== null || diff.summary.length === 0}
          >
            {loadingAction === 'merge' && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Approve & Merge
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleReject}
            disabled={loadingAction !== null}
          >
            {loadingAction === 'reject' && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Reject
          </Button>
        </div>
      </div>

      <Tabs defaultValue="results">
        <TabsList>
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="diffs">
            Diffs
            {diff.summary.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0">
                {diff.summary.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="results" className="mt-4">
          <ImprovementEvalResults
            tenantId={tenantId}
            projectId={projectId}
            branchName={branchName}
            isRunning={isRunning}
          />
        </TabsContent>
        <TabsContent value="diffs" className="mt-4">
          <ImprovementDiffView tenantId={tenantId} projectId={projectId} diff={diff} />
        </TabsContent>
      </Tabs>

      <Dialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Merge Conflicts
            </DialogTitle>
            <DialogDescription>
              {conflicts.length} conflict{conflicts.length !== 1 && 's'} detected. For each
              conflict, choose whether to keep the improvement branch changes or the current main
              branch version.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {conflicts.map((c) => {
              const key = conflictKey(c);
              return (
                <Card key={key}>
                  <CardHeader className="py-2 px-4">
                    <CardTitle className="text-xs font-mono">
                      {c.table} ({Object.entries(c.primaryKey).map(([k, v]) => `${k}=${v}`).join(', ')})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 space-y-3">
                    <RadioGroup
                      value={resolutions[key] ?? 'ours'}
                      onValueChange={(v) =>
                        setResolutions((prev) => ({ ...prev, [key]: v as 'ours' | 'theirs' }))
                      }
                    >
                      <div className="flex items-start gap-2">
                        <RadioGroupItem value="theirs" id={`${key}-theirs`} className="mt-1" />
                        <Label htmlFor={`${key}-theirs`} className="flex-1 cursor-pointer">
                          <span className="text-xs font-medium">
                            Keep improvement (branch)
                          </span>
                          {c.theirs && (
                            <pre className="mt-1 text-xs bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(c.theirs, null, 2)}
                            </pre>
                          )}
                        </Label>
                      </div>
                      <div className="flex items-start gap-2">
                        <RadioGroupItem value="ours" id={`${key}-ours`} className="mt-1" />
                        <Label htmlFor={`${key}-ours`} className="flex-1 cursor-pointer">
                          <span className="text-xs font-medium">
                            Keep current (main)
                          </span>
                          {c.ours && (
                            <pre className="mt-1 text-xs bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(c.ours, null, 2)}
                            </pre>
                          )}
                        </Label>
                      </div>
                    </RadioGroup>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowConflictDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleResolveAndMerge} disabled={loadingAction === 'merge'}>
              {loadingAction === 'merge' && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Resolve & Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
