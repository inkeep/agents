'use client';

import { CredentialStoreType, DEFAULT_NANGO_STORE_ID } from '@inkeep/agents-core/client-exports';
import type { ApiProvider } from '@nangohq/types';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { requiresCredentialForm } from '@/components/credentials/views/auth-form-config';
import { GenericAuthForm } from '@/components/credentials/views/generic-auth-form';
import { BodyTemplate } from '@/components/layout/body-template';
import { Button } from '@/components/ui/button';
import { useAuthSession } from '@/hooks/use-auth';
import { useNangoConnect } from '@/hooks/use-nango-connect';
import { useNangoProviders } from '@/hooks/use-nango-providers';
import { useAuthClient } from '@/lib/auth-client';
import { createProviderConnectSession } from '@/lib/mcp-tools/nango';
import { NangoError } from '@/lib/mcp-tools/nango-types';
import { findOrCreateCredential } from '@/lib/utils/credentials-utils';
import { generateId } from '@/lib/utils/id-utils';

function ProviderSetupPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/credentials/new/providers/[providerId]'>) {
  const router = useRouter();
  const { providers, loading: providersLoading } = useNangoProviders();
  const [loading, setLoading] = useState(false);
  const [hasAttempted, setHasAttempted] = useState(false);
  const { openNangoConnect } = useNangoConnect();
  const { user } = useAuthSession();
  const authClient = useAuthClient();
  const { providerId, tenantId, projectId } = use(params);

  const provider = providers?.find((p: ApiProvider) => encodeURIComponent(p.name) === providerId);

  const handleNangoConnect = async (event: any) => {
    if (!provider || event.type !== 'connect') return;

    if (!event.payload?.connectionId || !event.payload?.providerConfigKey) {
      console.error('Missing required connection data:', event.payload);
      toast.error('Invalid connection data received');
      return;
    }

    try {
      await findOrCreateCredential(tenantId, projectId, {
        id: generateId(),
        name: provider.name,
        type: CredentialStoreType.nango,
        createdBy: user?.email ?? undefined,
        credentialStoreId: DEFAULT_NANGO_STORE_ID,
        retrievalParams: {
          connectionId: event.payload.connectionId,
          providerConfigKey: event.payload.providerConfigKey,
          provider: provider.name,
          authMode: provider.auth_mode,
        },
      });

      toast.success('Credential created successfully');
      router.push(`/${tenantId}/projects/${projectId}/credentials`);
    } catch (credentialError) {
      console.error('Failed to create credential record:', credentialError);
      if (credentialError instanceof Error && credentialError.message?.includes('database')) {
        toast.error('Failed to save credential. Please check your connection and try again.');
      } else {
        toast.error('Failed to save credential. Please try again.');
      }
    }
  };

  const handleCreateCredential = async (credentials?: Record<string, any>) => {
    if (!provider) return;

    const { data: organizationData } = await authClient.organization.getFullOrganization();

    setLoading(true);
    setHasAttempted(true);
    try {
      const connectToken = await createProviderConnectSession({
        providerName: provider.name,
        uniqueKey: provider.name,
        displayName: provider.name,
        credentials:
          credentials && provider.auth_mode
            ? ({
                ...credentials,
                type: provider.auth_mode,
              } as any)
            : undefined,
        endUserId: user?.id,
        endUserEmail: user?.email,
        endUserDisplayName: user?.name,
        organizationId: organizationData?.id,
        organizationDisplayName: organizationData?.name,
      });

      openNangoConnect({
        sessionToken: connectToken,
        onEvent: handleNangoConnect,
      });
    } catch (error) {
      console.error('Failed to create credential:', error);

      if (error instanceof NangoError) {
        if (error.operation === 'createConnectSession') {
          toast.error('Failed to start authentication flow. Please try again.');
        } else {
          toast.error('Service temporarily unavailable. Please try again later.');
        }
      } else if (error instanceof Error && error.message?.includes('NANGO_SECRET_KEY')) {
        toast.error('Configuration error. Please contact support.');
      } else {
        toast.error('Failed to create credential. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Auto-connect when no credential form is required
  useEffect(() => {
    if (provider && !requiresCredentialForm(provider.auth_mode) && !loading && !hasAttempted) {
      handleCreateCredential();
    }
  }, [provider, loading, hasAttempted, handleCreateCredential]);

  const handleBack = () => {
    router.push(`/${tenantId}/projects/${projectId}/credentials/new/providers`);
  };

  if (providersLoading) {
    return <div className="flex items-center justify-center h-64">Loading provider...</div>;
  }

  if (!provider) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <h2 className="text-xl font-semibold">Provider not found.</h2>
        <p className="text-muted-foreground">
          The provider "{decodeURIComponent(providerId)}" was not found.
        </p>
        <button type="button" onClick={handleBack} className="text-primary hover:underline">
          ← Back to providers
        </button>
      </div>
    );
  }

  const isCredentialFormRequired = requiresCredentialForm(provider.auth_mode);

  if (!isCredentialFormRequired) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center justify-center space-y-4">
          <h2 className="text-xl font-semibold">Connecting to {provider.name}...</h2>
          <p className="text-muted-foreground">
            Please wait while we connect to {provider.name}...
          </p>
          <Button onClick={handleBack}>Back to providers</Button>
        </div>
      </div>
    );
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
        {
          label: 'Providers',
          href: `/${tenantId}/projects/${projectId}/credentials/new/providers`,
        },
        provider.display_name,
      ]}
      className="max-w-2xl mx-auto"
    >
      <GenericAuthForm
        provider={provider}
        onBack={handleBack}
        onSubmit={handleCreateCredential}
        loading={loading}
      />
    </BodyTemplate>
  );
}

export default ProviderSetupPage;
