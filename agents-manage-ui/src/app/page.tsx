import { DEFAULT_TENANT_ID } from '@/lib/runtime-config/defaults';
import { redirectToProject } from '@/lib/utils/project-redirect';

export const dynamic = 'force-dynamic';

async function Home() {
  if (!process.env.TENANT_ID) {
    console.warn(`TENANT_ID is not set, using default tenantId: ${DEFAULT_TENANT_ID}`);
  }
  const tenantId = process.env.TENANT_ID || DEFAULT_TENANT_ID;
  await redirectToProject(tenantId, 'graphs');
}

export default Home;
