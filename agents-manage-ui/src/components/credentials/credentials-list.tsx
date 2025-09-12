import type { Credential } from '@/lib/api/credentials';
import { CredentialItem } from './credential-item';

type CredentialsListProps = {
  tenantId: string;
  projectId: string;
  credentials: Credential[];
};

export function CredentialsList({ tenantId, projectId, credentials }: CredentialsListProps) {
  const getProviderFromCredential = (credential: Credential): string => {
    if (
      credential.retrievalParams?.provider &&
      typeof credential.retrievalParams.provider === 'string' &&
      credential.retrievalParams.provider !== 'private-api-bearer'
    ) {
      return credential.retrievalParams.provider;
    }

    return credential.id;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
      {credentials?.map((cred: Credential) => (
        <CredentialItem
          key={cred.id}
          {...cred}
          providerForIcon={getProviderFromCredential(cred)}
          tenantId={tenantId}
          projectId={projectId}
        />
      ))}
    </div>
  );
}
