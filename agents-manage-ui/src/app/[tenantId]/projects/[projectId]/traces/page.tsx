'use client';

import { useState } from 'react';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { TracesOverview } from '@/components/traces/traces-overview';

function TracesPage() {
  const [refreshKey, _setRefreshKey] = useState(0);

  return (
    <BodyTemplate breadcrumbs={[{ label: 'Traces' }]}>
      <MainContent>
        <TracesOverview key={`overview-${refreshKey}`} refreshKey={refreshKey} />
      </MainContent>
    </BodyTemplate>
  );
}

export default TracesPage;
