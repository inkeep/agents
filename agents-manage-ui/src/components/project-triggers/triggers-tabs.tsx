'use client';

import { parseAsStringLiteral, useQueryState } from 'nuqs';
import type { FC, ReactNode } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const VALID_TABS = ['scheduled', 'webhooks'] as const;
type TabValue = (typeof VALID_TABS)[number];

interface TriggersTabsProps {
  children: ReactNode;
}

export const TriggersTabs: FC<TriggersTabsProps> = ({ children }) => {
  'use memo';
  const [activeTab, setActiveTab] = useQueryState(
    'tab',
    parseAsStringLiteral(VALID_TABS).withDefault('scheduled')
  );

  return (
    <Tabs value={activeTab} onValueChange={(newTab) => setActiveTab(newTab as TabValue)}>
      <div className="border-b">
        <TabsList className="bg-transparent p-0">
          <TabsTrigger value="scheduled" variant="underline" className="h-10">
            Scheduled
          </TabsTrigger>
          <TabsTrigger value="webhooks" variant="underline" className="h-10">
            Webhooks
          </TabsTrigger>
        </TabsList>
      </div>
      {children}
    </Tabs>
  );
};
