'use client';

import dynamic from 'next/dynamic';

export const SearchDialog = dynamic(
  () => import('@/components/inkeep/inkeep-script').then((mod) => mod.InkeepScript),
  { ssr: false }
);
