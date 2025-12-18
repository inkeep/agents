'use client';

import { useState } from 'react';
import { TracesOverview } from '@/components/traces/traces-overview';
import { BodyTemplate } from '@/components/layout/body-template';

function TracesPage() {
  const [refreshKey, _setRefreshKey] = useState(0);

  return (
    <BodyTemplate breadcrumbs={[{ label: 'Traces' }]}>
      <TracesOverview key={`overview-${refreshKey}`} refreshKey={refreshKey} />
    </BodyTemplate>
  );
}

export default TracesPage;
