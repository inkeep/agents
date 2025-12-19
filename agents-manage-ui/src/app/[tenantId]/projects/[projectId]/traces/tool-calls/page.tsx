'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { BodyTemplate } from '@/components/layout/body-template';
import { ToolCallsBreakdown } from '@/components/traces/tool-calls-breakdown';

export default function ToolCallsPage() {
  const router = useRouter();
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();
  const searchParams = useSearchParams();

  const handleBackToTraces = () => {
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
        'Tool Calls Breakdown',
      ]}
    >
      <ToolCallsBreakdown onBack={handleBackToTraces} />
    </BodyTemplate>
  );
}
