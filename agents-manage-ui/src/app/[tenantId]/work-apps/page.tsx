import { redirect } from 'next/navigation';

interface PageParams {
  params: Promise<{ tenantId: string }>;
}

export default async function WorkAppsPage({ params }: PageParams) {
  const { tenantId } = await params;
  redirect(`/${tenantId}/work-apps/github`);
}
