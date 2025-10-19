import { Plus } from 'lucide-react';
import Link from 'next/link';
import { CredentialItem } from '@/components/credentials/credential-item';
import FullPageError from '@/components/errors/full-page-error';
import { CredentialsIcon } from '@/components/icons/empty-state/credentials';
import { BodyTemplate } from '@/components/layout/body-template';
import EmptyState from '@/components/layout/empty-state';
import { MainContent } from '@/components/layout/main-content';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { fetchCredentials } from '@/lib/api/credentials';

export const dynamic = 'force-dynamic';

const credentialDescription =
  'Create credentials that MCP servers can use to access external services.';

async function CredentialsPage({
  params,
}: {
  params: Promise<{ tenantId: string; projectId: string }>;
}) {
  const { tenantId, projectId } = await params;

  let credentials: Awaited<ReturnType<typeof fetchCredentials>>;
  try {
    credentials = await fetchCredentials(tenantId, projectId);
  } catch (error) {
    return <FullPageError error={error as Error} context="credentials" />;
  }

  return (
    <BodyTemplate breadcrumbs={[{ label: 'Credentials' }]}>
      <MainContent className="min-h-full">
        {credentials.length > 0 ? (
          <>
            <PageHeader
              title="Credentials"
              description={credentialDescription}
              action={
                <Button asChild>
                  <Link
                    href={`/${tenantId}/projects/${projectId}/credentials/new`}
                    className="flex items-center gap-2"
                  >
                    <Plus className="size-4" />
                    New credential
                  </Link>
                </Button>
              }
            />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
              {credentials?.map((cred) => (
                <CredentialItem
                  key={cred.id}
                  id={cred.id}
                  createdAt={cred.createdAt}
                  tenantId={tenantId}
                  projectId={projectId}
                />
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            title="No credentials yet."
            description={credentialDescription}
            link={`/${tenantId}/projects/${projectId}/credentials/new`}
            linkText="Create credential"
            icon={<CredentialsIcon />}
          />
        )}
      </MainContent>
    </BodyTemplate>
  );
}

export default CredentialsPage;
