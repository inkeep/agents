import { notFound } from 'next/navigation';
import { getCapabilitiesAction } from '@/lib/actions/capabilities';

export default async function CostLayout({ children }: { children: React.ReactNode }) {
  const capabilities = await getCapabilitiesAction();
  if (!capabilities.success || !capabilities.data?.costTracking?.enabled) {
    notFound();
  }
  return <>{children}</>;
}
