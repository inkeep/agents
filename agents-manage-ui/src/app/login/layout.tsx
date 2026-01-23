import type { Metadata } from 'next';

export const metadata = {
  title: 'Login',
} satisfies Metadata;

export default function Layout({ children }: LayoutProps<'/login'>) {
  return children;
}
