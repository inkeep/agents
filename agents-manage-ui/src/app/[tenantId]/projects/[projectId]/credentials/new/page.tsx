import { KeyRound, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderRoot,
  PageHeaderTitle,
} from '@/components/layout/page-header';
import { CardDescription, CardTitle } from '@/components/ui/card';
import { ExternalLink } from '@/components/ui/external-link';
import { ItemCardGrid } from '@/components/ui/item-card-grid';
import { DOCS_BASE_URL } from '@/constants/page-descriptions';
import { CredentialStoreType } from '@/constants/signoz';
import { listCredentialStores } from '@/lib/api/credentialStores';

interface CredentialOption {
  id: string;
  icon: ReactNode;
  title: string;
  description: string;
  href: string;
  isDisabled?: boolean;
}

async function NewCredentialsPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/credentials/new'>) {
  const { tenantId, projectId } = await params;

  const credentialStoresStatus = await listCredentialStores(tenantId, projectId);

  const isNangoReady = credentialStoresStatus.some(
    (store) => store.type === CredentialStoreType.nango && store.available
  );

  const isKeychainReady = credentialStoresStatus.some(
    (store) => store.type === CredentialStoreType.keychain && store.available
  );

  const credentialOptions: CredentialOption[] = [
    {
      id: 'providers',
      icon: <Search className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />,
      title: 'Browse providers',
      description:
        'Connect to popular providers like GitHub, Google Drive, Slack, and more. This is useful when you want to give MCP servers access to your providers.',
      href: `/${tenantId}/projects/${projectId}/credentials/new/providers`,
      isDisabled: !isNangoReady,
    },
    {
      id: 'bearer',
      icon: <KeyRound className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />,
      title: 'Bearer authentication',
      description:
        'Create a bearer token for API authentication. Useful when you need to provide secure access tokens to your MCP servers.',
      href: `/${tenantId}/projects/${projectId}/credentials/new/bearer`,
      isDisabled: !isNangoReady && !isKeychainReady,
    },
  ];

  const renderCredentialHeader = (option: CredentialOption) => (
    <div className="flex items-center gap-3">
      {option.icon}
      <div className="flex-1 min-w-0">
        <CardTitle className="text-sm truncate font-medium">{option.title}</CardTitle>
      </div>
    </div>
  );

  const renderCredentialContent = (option: CredentialOption) => (
    <CardDescription className="text-sm text-muted-foreground">
      {option.description}
    </CardDescription>
  );

  const pageHeaderComponent = isNangoReady ? (
    <PageHeader title="New credential" description="Create credentials for your MCP servers." />
  ) : (
    <PageHeaderRoot>
      <PageHeaderContent>
        <PageHeaderTitle>New credential</PageHeaderTitle>
        <div className="text-muted-foreground text-sm font-normal space-y-2">
          <p className="mb-8">Create credentials for your MCP servers.</p>
          <p>
            Nango Store is recommended to create credentials. Otherwise, make sure Keychain Store is
            available.
            <ExternalLink href={`${DOCS_BASE_URL}/get-started/credentials`}>
              Learn more
            </ExternalLink>
          </p>
        </div>
      </PageHeaderContent>
    </PageHeaderRoot>
  );

  return (
    <BodyTemplate
      breadcrumbs={[
        {
          label: 'Credentials',
          href: `/${tenantId}/projects/${projectId}/credentials`,
        },
        { label: 'New credential' },
      ]}
    >
      <MainContent>
        {pageHeaderComponent}
        <ItemCardGrid
          items={credentialOptions}
          getKey={(option) => option.id}
          getHref={(option) => option.href}
          renderHeader={renderCredentialHeader}
          renderContent={renderCredentialContent}
          isDisabled={(option) => option.isDisabled ?? false}
        />
      </MainContent>
    </BodyTemplate>
  );
}

export default NewCredentialsPage;
