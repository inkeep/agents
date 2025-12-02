import type { FC } from 'react';
import { BodyTemplate } from '@/components/layout/body-template';
import { Skeleton } from '@/components/ui/skeleton';

const AgentLoadingSkeleton: FC = () => {
  return (
    <BodyTemplate breadcrumbs={[{ label: 'Agents' }, { label: '' }]}>
      <div className="flex h-screen bg-muted/20 dark:bg-background p-4">
        <div className="w-52">
          <div className="space-y-2">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        </div>
        <div className="flex-1 flex flex-col">
          <div className="flex justify-end gap-3">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-16" />
          </div>
          <div className="w-64 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        </div>
      </div>
    </BodyTemplate>
  );
};

export default AgentLoadingSkeleton;
