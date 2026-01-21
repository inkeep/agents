import type { ApiProvider, AuthModeType } from '@nangohq/types';
import { NangoProvidersGrid } from '@/components/credentials/views/nango-providers-grid';
import FullPageError from '@/components/errors/full-page-error';
import { checkProjectPermissionOrRedirect } from '@/lib/auth/require-project-permission';
import { fetchNangoProviders } from '@/lib/mcp-tools/nango';

// Supported authentication modes (add new modes here as you implement them)
const SUPPORTED_AUTH_MODES: AuthModeType[] = [
  'OAUTH1',
  'OAUTH2',
  'OAUTH2_CC',
  'API_KEY',
  'BASIC',
  'APP',
  'JWT',
  'TBA',
  'CUSTOM',
  'NONE',
];

const DISABLED_PROVIDERS = ['hibob-service-user'];

/**
 * Filter providers by supported authentication modes
 */
function filterSupportedProviders(providers: ApiProvider[]): ApiProvider[] {
  return providers.filter(
    (provider) =>
      SUPPORTED_AUTH_MODES.includes(provider.auth_mode) &&
      !DISABLED_PROVIDERS.includes(provider.name)
  );
}

async function ProvidersPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/credentials/new/providers'>) {
  const { tenantId, projectId } = await params;

  await checkProjectPermissionOrRedirect(
    tenantId,
    projectId,
    'edit',
    `/${tenantId}/projects/${projectId}/credentials`
  );

  try {
    const nangoProviders = await fetchNangoProviders();
    const providers = filterSupportedProviders(nangoProviders);
    return <NangoProvidersGrid providers={providers} />;
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Failed to load providers';
    return <FullPageError title="Failed to load providers" description={error} />;
  }
}

export default ProvidersPage;
