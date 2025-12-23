'use client';

import { useParams, useRouter } from 'next/navigation';
import { BodyTemplate } from '@/components/layout/body-template';
import { ConversationDetail } from '@/components/traces/conversation-detail';

export default function ConversationPage() {
  const router = useRouter();
  const { conversationId, tenantId, projectId } = useParams<{
    conversationId: string;
    tenantId: string;
    projectId: string;
  }>();

  const handleBackToTraces = () => {
    router.push(`/${tenantId}/projects/${projectId}/traces`);
  };

  return (
    <BodyTemplate
      disableScroll
      breadcrumbs={[
        { label: 'Traces', href: `/${tenantId}/projects/${projectId}/traces` },
        'Conversation',
      ]}
    >
      <ConversationDetail conversationId={conversationId} onBack={handleBackToTraces} />
    </BodyTemplate>
  );
}
