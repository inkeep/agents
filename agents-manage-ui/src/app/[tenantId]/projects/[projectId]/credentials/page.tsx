import { Plus } from 'lucide-react';
import Link from 'next/link';
import { CredentialItem } from '@/components/credentials/credential-item';
import FullPageError from '@/components/errors/full-page-error';
import { CredentialsIcon } from '@/components/icons/empty-state/credentials';
import { BodyTemplate } from '@/components/layout/body-template';
import EmptyState from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { fetchCredentials } from '@/lib/api/credentials';
import { fetchProjectPermissions } from '@/lib/api/projects';
import { getErrorCode } from '@/lib/utils/error-serialization';

export const dynamic = 'force-dynamic';

const credentialDescription =
  'Create credentials that MCP servers can use to access external services.';

async function CredentialsPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/credentials'>) {
  const { tenantId, projectId } = await params;

  try {
    const [credentials, permissions] = await Promise.all([
      fetchCredentials(tenantId, projectId),
      fetchProjectPermissions(tenantId, projectId),
    ]);
    const canEdit = permissions.canEdit;
    const content = credentials.length ? (
      <>
        <PageHeader
          title="Credentials"
          description={credentialDescription}
          action={
            canEdit ? (
              <Button asChild>
                <Link
                  href={`/${tenantId}/projects/${projectId}/credentials/new`}
                  className="flex items-center gap-2"
                >
                  <Plus className="size-4" />
                  New credential
                </Link>
              </Button>
            ) : undefined
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
        description={credentialDescription}
        link={canEdit ? `/${tenantId}/projects/${projectId}/credentials/new` : undefined}
        linkText={canEdit ? 'Create credential' : undefined}
        icon={<CredentialsIcon />}
      />
    );
    return <BodyTemplate breadcrumbs={['Credentials']}>{content}</BodyTemplate>;
  } catch (error) {
    return <FullPageError errorCode={getErrorCode(error)} context="credentials" />;
  }
}

export default CredentialsPage;
