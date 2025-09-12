import { Plus } from 'lucide-react';
import Link from 'next/link';
import { CredentialsList } from '@/components/credentials/credentials-list';
import { CredentialsIcon } from '@/components/icons/empty-state/credentials';
import { BodyTemplate } from '@/components/layout/body-template';
import EmptyState from '@/components/layout/empty-state';
import { MainContent } from '@/components/layout/main-content';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import type { Credential } from '@/lib/api/credentials';
import { fetchCredentials } from '@/lib/api/credentials';

export const dynamic = 'force-dynamic';

const credentialDescription =
  'Create credentials that MCP Servers can use to access external services.';

async function CredentialsPage({
  params,
}: {
  params: Promise<{ tenantId: string; projectId: string }>;
}) {
  const { tenantId, projectId } = await params;
  let credentials: Credential[] = [];
  try {
    credentials = await fetchCredentials(tenantId, projectId);
  } catch (_error) {
    throw new Error('Failed to fetch credentials');
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
                    New Credential
                  </Link>
                </Button>
              }
            />
            <CredentialsList tenantId={tenantId} projectId={projectId} credentials={credentials} />
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
