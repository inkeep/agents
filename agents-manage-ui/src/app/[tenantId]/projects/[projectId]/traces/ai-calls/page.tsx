'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { AICallsBreakdown } from '@/components/traces/ai-calls-breakdown';

export default function AICallsPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const tenantId = params.tenantId as string;
  const projectId = params.projectId as string;

  const handleBackToTraces = () => {
    // Preserve the current search params when going back to traces
    const current = new URLSearchParams(searchParams.toString());
    const queryString = current.toString();

    const tracesUrl = queryString
      ? `/${tenantId}/projects/${projectId}/traces?${queryString}`
      : `/${tenantId}/projects/${projectId}/traces`;

    router.push(tracesUrl);
  };

  return (
    <BodyTemplate
      breadcrumbs={[
        { label: 'Traces', href: `/${tenantId}/projects/${projectId}/traces` },
        { label: 'AI Calls Breakdown' },
      ]}
    >
      <MainContent>
        <AICallsBreakdown onBack={handleBackToTraces} />
      </MainContent>
    </BodyTemplate>
  );
}
