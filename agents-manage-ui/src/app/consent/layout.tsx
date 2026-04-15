import type { Metadata } from 'next';

export const metadata = {
  title: 'Authorize Application',
} satisfies Metadata;

export default function Layout({ children }: LayoutProps<'/consent'>) {
  return children;
}
