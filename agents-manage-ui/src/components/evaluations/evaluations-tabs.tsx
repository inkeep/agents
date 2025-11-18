'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { EvaluationJobConfig } from '@/lib/api/evaluation-job-configs';
import type { EvaluationRunConfig } from '@/lib/api/evaluation-run-configs';
import type { Evaluator } from '@/lib/api/evaluators';
import { EvaluationJobFormDialog } from '../evaluation-jobs/evaluation-job-form-dialog';
import { EvaluationJobsList } from '../evaluation-jobs/evaluation-jobs-list';
import { EvaluationRunConfigFormDialog } from '../evaluation-run-configs/evaluation-run-config-form-dialog';
import { EvaluationRunConfigsList } from '../evaluation-run-configs/evaluation-run-configs-list';
import { EvaluatorFormDialog } from '../evaluators/evaluator-form-dialog';
import { EvaluatorsList } from '../evaluators/evaluators-list';

interface EvaluationsTabsProps {
  tenantId: string;
  projectId: string;
  evaluators: Evaluator[];
  jobConfigs: EvaluationJobConfig[];
  runConfigs: EvaluationRunConfig[];
}

export function EvaluationsTabs({
  tenantId,
  projectId,
  evaluators,
  jobConfigs,
  runConfigs,
}: EvaluationsTabsProps) {
  const [activeTab, setActiveTab] = useState('evaluators');
  const [isCreateEvaluatorOpen, setIsCreateEvaluatorOpen] = useState(false);
  const [isCreateJobOpen, setIsCreateJobOpen] = useState(false);
  const [isCreateRunConfigOpen, setIsCreateRunConfigOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <div className="flex items-center justify-between border-b">
        <TabsList className="border-b bg-transparent p-0 h-auto">
          <TabsTrigger value="evaluators" variant="underline" className="h-10">
            Evaluators
          </TabsTrigger>
          <TabsTrigger value="jobs" variant="underline" className="h-10">
            Batch Evaluations
          </TabsTrigger>
          <TabsTrigger value="run-configs" variant="underline" className="h-10">
            Continuous Tests
          </TabsTrigger>
        </TabsList>
        {activeTab === 'evaluators' && (
          <div className="flex items-center h-10 px-4">
            <EvaluatorFormDialog
              tenantId={tenantId}
              projectId={projectId}
              isOpen={isCreateEvaluatorOpen}
              onOpenChange={setIsCreateEvaluatorOpen}
              trigger={
                <Button variant="ghost" size="sm">
                  <Plus />
                  New evaluator
                </Button>
              }
            />
          </div>
        )}
        {activeTab === 'jobs' && (
          <div className="flex items-center h-10 px-4">
            <EvaluationJobFormDialog
              tenantId={tenantId}
              projectId={projectId}
              isOpen={isCreateJobOpen}
              onOpenChange={setIsCreateJobOpen}
              trigger={
                <Button variant="ghost" size="sm">
                  <Plus />
                  New batch evaluation
                </Button>
              }
            />
          </div>
        )}
        {activeTab === 'run-configs' && (
          <div className="flex items-center h-10 px-4">
            <EvaluationRunConfigFormDialog
              tenantId={tenantId}
              projectId={projectId}
              isOpen={isCreateRunConfigOpen}
              onOpenChange={setIsCreateRunConfigOpen}
              onSuccess={() => {
                // Trigger refresh by incrementing refreshKey
                console.log('EvaluationRunConfigFormDialog onSuccess called');
                setRefreshKey((prev) => {
                  const newKey = prev + 1;
                  console.log('Setting refreshKey to:', newKey);
                  return newKey;
                });
              }}
              trigger={
                <Button variant="ghost" size="sm">
                  <Plus />
                  New continuous test
                </Button>
              }
            />
          </div>
        )}
      </div>

      <TabsContent value="evaluators" className="mt-6">
        <EvaluatorsList tenantId={tenantId} projectId={projectId} evaluators={evaluators} />
      </TabsContent>

      <TabsContent value="jobs" className="mt-6">
        <EvaluationJobsList tenantId={tenantId} projectId={projectId} jobConfigs={jobConfigs} />
      </TabsContent>

      <TabsContent value="run-configs" className="mt-6">
        <EvaluationRunConfigsList
          tenantId={tenantId}
          projectId={projectId}
          runConfigs={runConfigs}
          refreshKey={refreshKey}
        />
      </TabsContent>
    </Tabs>
  );
}
