import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CredentialItem } from '@/components/credentials/credential-item';
import FullPageError from '@/components/errors/full-page-error';
import { CredentialsIcon } from '@/components/icons/empty-state/credentials';
import EmptyState from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { STATIC_LABELS } from '@/constants/theme';
import { fetchCredentials } from '@/lib/api/credentials';
import { getErrorCode } from '@/lib/utils/error-serialization';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: STATIC_LABELS.credentials,
  description: 'Create credentials that MCP servers can use to access external services.',
} satisfies Metadata;

async function CredentialsPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/credentials'>) {
  const { tenantId, projectId } = await params;

  try {
    const credentials = await fetchCredentials(tenantId, projectId);
    return credentials.length ? (
      <>
        <PageHeader
          title={metadata.title}
          description={metadata.description}
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
              name={cred.name}
              createdAt={cred.createdAt}
              createdBy={cred.createdBy}
              tenantId={tenantId}
              projectId={projectId}
            />
          ))}
        </div>
      </>
    ) : (
      <EmptyState
        title="No credentials yet."
        description={metadata.description}
        link={`/${tenantId}/projects/${projectId}/credentials/new`}
        linkText="Create credential"
        icon={<CredentialsIcon />}
      />
    );
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="credentials" />;
  }
}

export default CredentialsPage;
