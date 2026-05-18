import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { WebhookDestinationForm } from '@/components/webhook-destinations/webhook-destination-form';
import { fetchAgents } from '@/lib/api/agent-full-client';

export const metadata = {
  title: 'New Outbound Webhook',
  description: 'Create a new outbound webhook for this project.',
} satisfies Metadata;

const ALLOWED_PREFILL_PREFIX = 'https://hooks.slack.com/';

export default async function NewWebhookDestinationPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string; projectId: string }>;
  searchParams: Promise<{ url?: string }>;
}) {
  const { tenantId, projectId } = await params;
  const { url: rawPrefillUrl } = await searchParams;
  const prefillUrl = rawPrefillUrl?.startsWith(ALLOWED_PREFILL_PREFIX) ? rawPrefillUrl : undefined;

  const agentsResponse = await fetchAgents(tenantId, projectId);
  const agents = agentsResponse.data.map((a) => ({ id: a.id, name: a.name }));

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href={`/${tenantId}/projects/${projectId}/webhook-destinations`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Back to outbound webhooks
          </Button>
        </Link>
      </div>
      <PageHeader title={metadata.title} description={metadata.description} />
      <WebhookDestinationForm
        mode="create"
        tenantId={tenantId}
        projectId={projectId}
        agents={agents}
        defaultUrl={prefillUrl}
      />
    </div>
  );
}
