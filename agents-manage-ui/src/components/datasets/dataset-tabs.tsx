'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DatasetItemFormDialog } from '@/components/dataset-items/dataset-item-form-dialog';
import { DatasetItemsTable } from '@/components/dataset-items/dataset-items-table';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { DatasetItem } from '@/lib/api/dataset-items';
import { DatasetRunConfigFormDialog } from './dataset-run-config-form-dialog';
import { DatasetRunsList } from './dataset-runs-list';

interface DatasetTabsProps {
  tenantId: string;
  projectId: string;
  datasetId: string;
  items: DatasetItem[];
  defaultTab?: string;
  onTabChange?: (tab: string) => void;
}

export function DatasetTabs({
  tenantId,
  projectId,
  datasetId,
  items,
  defaultTab = 'items',
  onTabChange,
}: DatasetTabsProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [isCreateItemOpen, setIsCreateItemOpen] = useState(false);
  const [isCreateRunOpen, setIsCreateRunOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
      <div className="flex items-center justify-between border-b">
        <TabsList className="border-b bg-transparent p-0 h-auto">
          <TabsTrigger value="runs" variant="underline" className="h-10">
            Runs
          </TabsTrigger>
          <TabsTrigger value="items" variant="underline" className="h-10">
            Items
          </TabsTrigger>
        </TabsList>
        {activeTab === 'items' && (
          <div className="flex items-center h-10 px-4">
            <DatasetItemFormDialog
              tenantId={tenantId}
              projectId={projectId}
              datasetId={datasetId}
              isOpen={isCreateItemOpen}
              onOpenChange={setIsCreateItemOpen}
              trigger={
                <Button variant="ghost" size="sm" className="h-8">
                  <Plus />
                  New item
                </Button>
              }
            />
          </div>
        )}
        {activeTab === 'runs' && (
          <div className="flex items-center h-10 px-4">
            <DatasetRunConfigFormDialog
              tenantId={tenantId}
              projectId={projectId}
              datasetId={datasetId}
              isOpen={isCreateRunOpen}
              onOpenChange={setIsCreateRunOpen}
              onSuccess={() => {
                console.log('Dataset run config created, triggering refresh');
                setRefreshKey((prev) => prev + 1);
                router.refresh();
              }}
              trigger={
                <Button variant="ghost" size="sm" className="h-8">
                  <Plus />
                  New run
                </Button>
              }
            />
          </div>
        )}
      </div>

      <TabsContent value="runs" className="mt-6">
        <DatasetRunsList
          tenantId={tenantId}
          projectId={projectId}
          datasetId={datasetId}
          refreshKey={refreshKey}
        />
      </TabsContent>

      <TabsContent value="items" className="mt-6">
        <DatasetItemsTable
          tenantId={tenantId}
          projectId={projectId}
          datasetId={datasetId}
          items={items}
        />
      </TabsContent>
    </Tabs>
  );
}
