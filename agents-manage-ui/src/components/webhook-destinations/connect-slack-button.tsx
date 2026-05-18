'use client';

import { Slack } from 'lucide-react';
import { Button } from '@/components/ui/button';

const getApiUrl = () => process.env.NEXT_PUBLIC_INKEEP_AGENTS_API_URL || 'http://localhost:3002';

interface ConnectSlackButtonProps {
  tenantId: string;
  projectId: string;
}

export function ConnectSlackButton({ tenantId, projectId }: ConnectSlackButtonProps) {
  const installUrl = new URL(`${getApiUrl()}/work-apps/slack/install`);
  installUrl.searchParams.set('tenant_id', tenantId);
  installUrl.searchParams.set('project_id', projectId);
  installUrl.searchParams.set('include_webhook', 'true');

  return (
    <Button variant="outline" asChild>
      <a href={installUrl.toString()}>
        <Slack className="h-4 w-4 mr-2" />
        Connect Slack Channel
      </a>
    </Button>
  );
}
