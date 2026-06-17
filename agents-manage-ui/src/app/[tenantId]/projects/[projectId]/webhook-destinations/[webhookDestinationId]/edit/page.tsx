import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { WebhookDestinationForm } from '@/components/webhook-destinations/webhook-destination-form';
import { fetchAgents } from '@/lib/api/agent-full-client';
import { getWebhookDestination, type WebhookDestination } from '@/lib/api/webhook-destinations';
import { checkProjectPermissionOrRedirect } from '@/lib/auth/check-permission-or-redirect';

export const metadata = {
  title: 'Edit Outbound Webhook',
  description: 'Update outbound webhook configuration.',
} satisfies Metadata;

export default async function EditWebhookDestinationPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/webhook-destinations/[webhookDestinationId]/edit'>) {
  const { tenantId, projectId, webhookDestinationId } = await params;
  await checkProjectPermissionOrRedirect(
    tenantId,
    projectId,
    'edit',
    `/${tenantId}/projects/${projectId}/webhook-destinations`
  );

  let webhookDestination: WebhookDestination;
  try {
    webhookDestination = await getWebhookDestination(tenantId, projectId, webhookDestinationId);
  } catch {
    notFound();
  }

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
        mode="edit"
        tenantId={tenantId}
        projectId={projectId}
        webhookDestination={webhookDestination}
        agents={agents}
      />
    </div>
  );
}
