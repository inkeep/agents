'use client';

import type { ReactNode, FC } from 'react';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const VALID_TABS = ['scheduled', 'webhooks'] as const;
type TabValue = (typeof VALID_TABS)[number];

interface TriggersTabsProps {
  scheduledContent: ReactNode;
  webhooksContent: ReactNode;
}

export const TriggersTabs: FC<TriggersTabsProps> = ({ scheduledContent, webhooksContent }) => {
  'use memo';
  const [activeTab, setActiveTab] = useQueryState(
    'tab',
    parseAsStringLiteral(VALID_TABS).withDefault('scheduled')
  );

  return (
    <Tabs
      value={activeTab}
      onValueChange={(newTab) => setActiveTab(newTab as TabValue)}
      className="w-full"
    >
      <div className="border-b">
        <TabsList className="h-10 w-full justify-start border-none bg-transparent p-0 rounded-none">
          <TabsTrigger value="scheduled" variant="underline" className="h-10">
            Scheduled
          </TabsTrigger>
          <TabsTrigger value="webhooks" variant="underline" className="h-10">
            Webhooks
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="scheduled" className="mt-6">
        {scheduledContent}
      </TabsContent>

      <TabsContent value="webhooks" className="mt-6">
        {webhooksContent}
      </TabsContent>
    </Tabs>
  );
};
