'use client';

import type { FC, ReactNode } from 'react';
import { RootProvider } from 'fumadocs-ui/provider/next';
import dynamic from 'next/dynamic';

const SearchDialog = dynamic(
  () => import('@/components/inkeep/inkeep-script').then((mod) => mod.InkeepScript),
  { ssr: false }
);

export const Provider: FC<{ children: ReactNode }> = ({ children }) => {
  return <RootProvider search={{ SearchDialog }}>{children}</RootProvider>;
};
