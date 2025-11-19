'use client';

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useChatActivitiesPolling } from '@/hooks/use-chat-activities-polling';
import type { Branch } from '@/lib/api/branches';
import type { DataComponent } from '@/lib/api/data-components';
import { generateId } from '@/lib/utils/id-utils';
import { ChatWidget } from '../playground/chat-widget';

interface AgentComparisonProps {
  agentId: string;
  currentBranch: string;
  availableBranches: Branch[];
  tenantId: string;
  projectId: string;
  dataComponentLookup?: Record<string, DataComponent>;
  onClose: () => void;
}

export function AgentComparison({
  agentId,
  currentBranch,
  availableBranches,
  tenantId,
  projectId,
  dataComponentLookup = {},
  onClose,
}: AgentComparisonProps) {
  const [compareBranch, setCompareBranch] = useState<string>(
    availableBranches.find((b) => b.baseName !== currentBranch)?.baseName || ''
  );

  // Filter out current branch from comparison options
  const comparisonBranches = availableBranches.filter((b) => b.baseName !== currentBranch);

  // Chat state for current branch
  const [conversationIdCurrent, setConversationIdCurrent] = useState(generateId);
  const {
    chatActivities: chatActivitiesCurrent,
    startPolling: startPollingCurrent,
    stopPolling: stopPollingCurrent,
  } = useChatActivitiesPolling({
    conversationId: conversationIdCurrent,
  });

  // Chat state for comparison branch
  const [conversationIdCompare, setConversationIdCompare] = useState(generateId);
  const {
    chatActivities: chatActivitiesCompare,
    startPolling: startPollingCompare,
    stopPolling: stopPollingCompare,
  } = useChatActivitiesPolling({
    conversationId: conversationIdCompare,
  });

  // Reset conversation when compare branch changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: compareBranch is intentionally tracked to reset conversation on branch change
  useEffect(() => {
    setConversationIdCompare(generateId());
    stopPollingCompare();
  }, [compareBranch, stopPollingCompare]);

  // Don't show if there are no other branches
  if (comparisonBranches.length === 0) {
    return null;
  }

  return (
    <div className="bg-background flex flex-col h-full">
      {/* Side-by-side comparison */}
      <div className="grid flex-1 grid-cols-2 divide-x min-h-0">
        {/* Current branch */}
        <div className="flex flex-col min-h-0">
          <div className="border-b bg-muted/50 px-4 shrink-0 flex items-center h-11">
            <h3 className="text-sm font-medium">{currentBranch}</h3>
          </div>
          <div className="flex-1 min-h-0">
            <ChatWidget
              conversationId={conversationIdCurrent}
              setConversationId={setConversationIdCurrent}
              startPolling={startPollingCurrent}
              stopPolling={stopPollingCurrent}
              agentId={agentId}
              projectId={projectId}
              tenantId={tenantId}
              chatActivities={chatActivitiesCurrent}
              dataComponentLookup={dataComponentLookup}
              ref={currentBranch}
            />
          </div>
        </div>

        {/* Compare branch */}
        <div className="flex flex-col min-h-0">
          <div className="border-b bg-muted/50 px-4 shrink-0 flex items-center gap-2 relative z-10 h-11">
            <span className="text-sm text-muted-foreground">Compare with:</span>
            <Select value={compareBranch} onValueChange={setCompareBranch}>
              <SelectTrigger className="w-[180px] h-8">
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent className="z-[110]">
                {comparisonBranches.map((branch) => (
                  <SelectItem key={branch.baseName} value={branch.baseName}>
                    {branch.baseName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 ml-auto">
              <Button onClick={onClose} variant="ghost" size="icon-sm" className="h-6">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <ChatWidget
              key={compareBranch}
              conversationId={conversationIdCompare}
              setConversationId={setConversationIdCompare}
              startPolling={startPollingCompare}
              stopPolling={stopPollingCompare}
              agentId={agentId}
              projectId={projectId}
              tenantId={tenantId}
              ref={compareBranch}
              chatActivities={chatActivitiesCompare}
              dataComponentLookup={dataComponentLookup}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
