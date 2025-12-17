import type { FC } from 'react';
import { BodyTemplate } from '@/components/layout/body-template';
import { Skeleton } from '@/components/ui/skeleton';

export const AgentSkeleton: FC = () => {
  return (
    <div className="flex h-screen bg-muted/20 dark:bg-background p-4">
      <div className="flex flex-col gap-2" style={{ width: 160 }}>
        <Skeleton style={{ height: 38 }} />
        <Skeleton style={{ height: 38 }} />
        <Skeleton style={{ height: 38 }} />
        <Skeleton style={{ height: 38 }} />
        <Skeleton style={{ height: 38 }} />
      </div>
      <div className="flex-1 flex flex-col">
        <div className="flex justify-end gap-2 h-9">
          <Skeleton style={{ width: 84 }} />
          <Skeleton style={{ width: 100 }} />
          <Skeleton style={{ width: 127 }} />
          <Skeleton style={{ width: 168 }} />
        </div>
        <div className="w-64 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <Skeleton className="h-36 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
};

export default function Loading() {
  return (
    <BodyTemplate breadcrumbs={[{ label: 'Agents' }, { label: '' }]}>
      <AgentSkeleton />
    </BodyTemplate>
  );
}
