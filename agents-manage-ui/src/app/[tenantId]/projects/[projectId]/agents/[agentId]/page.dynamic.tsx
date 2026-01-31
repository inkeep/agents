'use client';
import dynamic from 'next/dynamic';
import Loading from './loading';

export const Agent = dynamic(() => import('./page.client').then((mod) => mod.Agent), {
  ssr: false,
  loading: () => <Loading />,
});
