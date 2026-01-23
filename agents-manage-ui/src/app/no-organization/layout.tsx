import type { Metadata } from 'next';
import { STATIC_LABELS } from '@/constants/theme';

export const metadata = {
  title: STATIC_LABELS['no-organization-found'],
} satisfies Metadata;

export default function Layout({ children }: LayoutProps<'/no-organization'>) {
  return children;
}
