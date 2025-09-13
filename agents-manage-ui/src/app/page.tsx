import { redirectToProject } from '../lib/utils/project-redirect';

const DEFAULT_TENANT_ID = 'default';

async function Home() {
  if (!process.env.NEXT_PUBLIC_TENANT_ID) {
    console.warn(`NEXT_PUBLIC_TENANT_ID is not set, using default tenantId: ${DEFAULT_TENANT_ID}`);
  }
  const tenantId = process.env.NEXT_PUBLIC_TENANT_ID || DEFAULT_TENANT_ID;
  await redirectToProject(tenantId, 'graphs');
}

export default Home;
