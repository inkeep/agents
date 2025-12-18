'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { SetBreadcrumbs } from '@/components/layout/set-breadcrumbs';
import { AICallsBreakdown } from '@/components/traces/ai-calls-breakdown';

export default function AICallsPage() {
  const router = useRouter();
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();
  const searchParams = useSearchParams();

  const handleBackToTraces = () => {
    // Preserve the current search params when going back to traces
    const current = new URLSearchParams(searchParams.toString());
    const queryString = current.toString();

    const tracesUrl = queryString
      ? `/${tenantId}/projects/${projectId}/traces?${queryString}`
      : `/${tenantId}/projects/${projectId}/traces`;

    router.push(tracesUrl);
  };

  return <AICallsBreakdown onBack={handleBackToTraces} />;
}
