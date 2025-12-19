import type { FC } from 'react';
import { BodyTemplate } from '@/components/layout/body-template';
import { Skeleton } from '@/components/ui/skeleton';

export const AgentSkeleton: FC = () => {
  return (
    <div className="flex p-4">
      <div className="flex flex-col gap-2" style={{ width: 160 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} style={{ height: 38 }} />
        ))}
      </div>
      <div className="ml-auto flex gap-2 h-9">
        <Skeleton style={{ width: 84 }} />
        <Skeleton style={{ width: 100 }} />
        <Skeleton style={{ width: 127 }} />
        <Skeleton style={{ width: 168 }} />
      </div>
      <Skeleton className="h-36 rounded-lg w-64 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
    </div>
  );
};

// To avoid have flash of skeleton from `[projectId]/loading.tsx` until `agent` is fetched from `getFullAgentAction` in `page.tsx` file
const AgentLoading: FC = () => {
  return (
    <BodyTemplate
      breadcrumbs={[]}
      // Remove inner div from the layout so the p-6 padding doesn’t apply
      className="contents"
    >
      <AgentSkeleton />
    </BodyTemplate>
  );
};

export default AgentLoading;
