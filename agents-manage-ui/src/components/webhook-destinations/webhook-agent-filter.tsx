'use client';

import { useRouter } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface WebhookAgentFilterProps {
  agents: { id: string; name: string }[];
  selectedAgentId?: string;
  tenantId: string;
  projectId: string;
}

export function WebhookAgentFilter({
  agents,
  selectedAgentId,
  tenantId,
  projectId,
}: WebhookAgentFilterProps) {
  const router = useRouter();
  const basePath = `/${tenantId}/projects/${projectId}/webhook-destinations`;

  function handleChange(value: string) {
    if (value === 'all') {
      router.push(basePath);
    } else {
      router.push(`${basePath}?agentId=${value}`);
    }
  }

  return (
    <Select value={selectedAgentId ?? 'all'} onValueChange={handleChange}>
      <SelectTrigger className="w-[220px]">
        <SelectValue placeholder="Filter by agent" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All agents</SelectItem>
        {agents.map((agent) => (
          <SelectItem key={agent.id} value={agent.id}>
            {agent.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
