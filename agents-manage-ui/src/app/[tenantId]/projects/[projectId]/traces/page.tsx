'use client';

import { useState } from 'react';
import { TracesOverview } from '@/components/traces/traces-overview';

function TracesPage() {
  const [refreshKey, _setRefreshKey] = useState(0);

  return <TracesOverview key={`overview-${refreshKey}`} refreshKey={refreshKey} />;
}

export default TracesPage;
