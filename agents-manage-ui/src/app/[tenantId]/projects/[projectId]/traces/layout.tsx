import type { Metadata } from 'next';
import { STATIC_LABELS } from '@/constants/theme';

export const metadata = {
  title: STATIC_LABELS.traces,
} satisfies Metadata;

export default function Layout({
  children,
}: LayoutProps<'/[tenantId]/projects/[projectId]/traces'>) {
  return children;
}
