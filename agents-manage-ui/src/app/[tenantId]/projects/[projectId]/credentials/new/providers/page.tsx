import type { ApiProvider, AuthModeType } from '@nangohq/types';
import { NangoProvidersGrid } from '@/components/credentials/views/nango-providers-grid';
import FullPageError from '@/components/errors/full-page-error';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
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

/**
 * Filter providers by supported authentication modes
 */
function filterSupportedProviders(providers: ApiProvider[]): ApiProvider[] {
  return providers.filter((provider) => SUPPORTED_AUTH_MODES.includes(provider.auth_mode));
}

async function ProvidersPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/credentials/new/providers'>) {
  const { tenantId, projectId } = await params;
  let providers: ApiProvider[];

  try {
    const nangoProviders = await fetchNangoProviders();
    providers = filterSupportedProviders(nangoProviders);
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Failed to load providers';
    return <FullPageError title="Failed to load providers" description={error} />;
  }

  return (
    <BodyTemplate
      breadcrumbs={[
        {
          label: 'Credentials',
          href: `/${tenantId}/projects/${projectId}/credentials`,
        },
        {
          label: 'New credential',
          href: `/${tenantId}/projects/${projectId}/credentials/new`,
        },
        { label: 'Providers' },
      ]}
    >
      <MainContent>
        <NangoProvidersGrid providers={providers} />
      </MainContent>
    </BodyTemplate>
  );
}

export default ProvidersPage;
