import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Authorize Application',
} satisfies Metadata;

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
