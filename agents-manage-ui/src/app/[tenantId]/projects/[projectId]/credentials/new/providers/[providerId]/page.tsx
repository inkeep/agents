'use client';

import { CredentialStoreType } from '@inkeep/agents-core';
import { generateIdFromName } from '@inkeep/agents-core/client-exports';
import type { ApiProvider } from '@nangohq/types';
import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { requiresCredentialForm } from '@/components/credentials/views/auth-form-config';
import { GenericAuthForm } from '@/components/credentials/views/generic-auth-form';
import { BodyTemplate } from '@/components/layout/body-template';
import { MainContent } from '@/components/layout/main-content';
import { Button } from '@/components/ui/button';
import { useNangoConnect } from '@/hooks/use-nango-connect';
import { useNangoProviders } from '@/hooks/use-nango-providers';
import { createProviderConnectSession } from '@/lib/mcp-tools/nango';
import { NangoError } from '@/lib/mcp-tools/nango-types';
import { findOrCreateCredential } from '@/lib/utils/credentials-utils';

interface ProviderSetupPageProps {
  params: Promise<{
    providerId: string;
    tenantId: string;
    projectId: string;
  }>;
}

function ProviderSetupPage({ params }: ProviderSetupPageProps) {
  const router = useRouter();
  const { providers, loading: providersLoading } = useNangoProviders();
  const [loading, setLoading] = useState(false);
  const [hasAttempted, setHasAttempted] = useState(false);
  const openNangoConnect = useNangoConnect();

  const { providerId, tenantId, projectId } = use(params);

  const provider = providers?.find((p: ApiProvider) => encodeURIComponent(p.name) === providerId);

  const handleNangoConnect = useCallback(
    async (event: any) => {
      if (!provider || event.type !== 'connect') return;

      // Validate required payload data
      if (!event.payload?.connectionId || !event.payload?.providerConfigKey) {
        console.error('Missing required connection data:', event.payload);
        toast.error('Invalid connection data received');
        return;
      }

      const credentialId = generateIdFromName(`${provider.name}-${event.payload.connectionId}`);

      try {
        await findOrCreateCredential(tenantId, projectId, {
          id: credentialId,
          type: CredentialStoreType.nango,
          credentialStoreId: 'nango-default',
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
    },
    [provider, tenantId, projectId, router]
  );

  const handleCreateCredential = useCallback(
    async (credentials?: Record<string, any>) => {
      if (!provider) return;

      setLoading(true);
      setHasAttempted(true);
      try {
        const connectToken = await createProviderConnectSession({
          providerName: provider.name,
          credentials:
            credentials && provider.auth_mode
              ? ({
                  ...credentials,
                  type: provider.auth_mode,
                } as any)
              : undefined,
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
    },
    [provider, openNangoConnect, handleNangoConnect]
  );

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
        <h2 className="text-xl font-semibold">Provider not found</h2>
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
        { label: 'Credentials', href: `/${tenantId}/projects/${projectId}/credentials` },
        { label: 'New Credential', href: `/${tenantId}/projects/${projectId}/credentials/new` },
        {
          label: 'Providers',
          href: `/${tenantId}/projects/${projectId}/credentials/new/providers`,
        },
        { label: provider.display_name },
      ]}
    >
      <MainContent>
        <div className="max-w-2xl mx-auto py-4">
          <GenericAuthForm
            provider={provider}
            onBack={handleBack}
            onSubmit={handleCreateCredential}
            loading={loading}
          />
        </div>
      </MainContent>
    </BodyTemplate>
  );
}

export default ProviderSetupPage;
