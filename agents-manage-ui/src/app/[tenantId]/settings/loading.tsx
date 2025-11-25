import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { PageHeader } from '@/components/layout/page-header';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <BodyTemplate>
      <MainContent>
        <PageHeader title="Organization Settings" description="Manage your organization settings" />
        <div className="space-y-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={`loading-skeleton-${i}`} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      </MainContent>
    </BodyTemplate>
  );
}
