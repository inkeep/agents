'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const VALID_TABS = ['scheduled', 'webhooks'] as const;
type TabValue = (typeof VALID_TABS)[number];

interface TriggersTabsProps {
  scheduledContent: ReactNode;
  webhooksContent: ReactNode;
}

export function TriggersTabs({ scheduledContent, webhooksContent }: TriggersTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get('tab');
  const activeTab: TabValue = VALID_TABS.includes(tabParam as TabValue)
    ? (tabParam as TabValue)
    : 'scheduled';

  const setActiveTab = (tab: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
}
