'use client';

import { useParams, useRouter } from 'next/navigation';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { ConversationDetail } from '@/components/traces/conversation-detail';

export default function ConversationPage() {
  const router = useRouter();
  const params = useParams();

  const conversationId = params.conversationId as string;
  const tenantId = params.tenantId as string;
  const projectId = params.projectId as string;

  const handleBackToTraces = () => {
    router.push(`/${tenantId}/projects/${projectId}/traces`);
  };

  return (
    <BodyTemplate
      breadcrumbs={[
        { label: 'Traces', href: `/${tenantId}/projects/${projectId}/traces` },
        { label: 'Conversation' },
      ]}
    >
      <MainContent className="h-full flex flex-col">
        <ConversationDetail conversationId={conversationId} onBack={handleBackToTraces} />
      </MainContent>
    </BodyTemplate>
  );
}
