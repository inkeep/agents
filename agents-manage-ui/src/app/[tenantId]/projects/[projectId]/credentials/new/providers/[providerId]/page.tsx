'use client';

import { CredentialStoreType, DEFAULT_NANGO_STORE_ID } from '@inkeep/agents-core/client-exports';
import type { ApiProvider } from '@nangohq/types';
import { MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { requiresCredentialForm } from '@/components/credentials/views/auth-form-config';
import { GenericAuthForm } from '@/components/credentials/views/generic-auth-form';
import { ProviderIcon } from '@/components/icons/provider-icon';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthClient } from '@/contexts/auth-client';
import { useProjectPermissions } from '@/contexts/project';
import { useAuthSession } from '@/hooks/use-auth';
import { useNangoConnect } from '@/hooks/use-nango-connect';
import { useNangoProviders } from '@/hooks/use-nango-providers';
import {
  buildCredentialsPayload,
  createProviderConnectSession,
  deleteNangoIntegration,
  listNangoProviderIntegrations,
  type NangoIntegrationWithMaskedCredentials,
  updateNangoIntegrationCredentials,
} from '@/lib/mcp-tools/nango';
import { NangoError } from '@/lib/mcp-tools/nango-types';
import { findOrCreateCredential } from '@/lib/utils/credentials-utils';
import { generateId } from '@/lib/utils/id-utils';

type FormMode = { type: 'idle' } | { type: 'create' } | { type: 'update'; integrationKey: string };

function ProviderSetupPage({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/credentials/new/providers/[providerId]'>) {
  const router = useRouter();
  const { canEdit } = useProjectPermissions();
  const { providers, loading: providersLoading } = useNangoProviders();
  const [loading, setLoading] = useState(false);
  const [hasAttempted, setHasAttempted] = useState(false);
  const [integrations, setIntegrations] = useState<NangoIntegrationWithMaskedCredentials[] | null>(
    null
  );
  const [formMode, setFormMode] = useState<FormMode>({ type: 'idle' });
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const { openNangoConnect } = useNangoConnect();
  const { user } = useAuthSession();
  const authClient = useAuthClient();
  const { providerId, tenantId, projectId } = use(params);

  useEffect(() => {
    if (!canEdit) {
      router.replace(`/${tenantId}/projects/${projectId}/credentials`);
    }
  }, [canEdit, router, tenantId, projectId]);

  const provider = providers?.find((p: ApiProvider) => encodeURIComponent(p.name) === providerId);

  useEffect(() => {
    if (!provider || !requiresCredentialForm(provider.auth_mode)) return;
    const load = async () => {
      try {
        const result = await listNangoProviderIntegrations(provider.name, tenantId);
        setIntegrations(result);
      } catch {
        setIntegrations([]);
      }
    };
    load();
  }, [provider, tenantId]);

  const handleNangoConnect = useCallback(
    async (event: any) => {
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
    },
    [provider, tenantId, projectId, router, user?.email]
  );

  const startConnectFlow = useCallback(
    async (integrationKey: string, credentials?: Record<string, any>) => {
      if (!provider) return;

      const { data: organizationData } = await authClient.organization.getFullOrganization();

      setLoading(true);
      setHasAttempted(true);
      try {
        const connectToken = await createProviderConnectSession({
          providerName: provider.name,
          uniqueKey: integrationKey,
          displayName: provider.name,
          credentials: buildCredentialsPayload(credentials, provider.auth_mode),
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
    },
    [provider, openNangoConnect, handleNangoConnect, user?.id, user?.email, user?.name, authClient]
  );

  const handleCreateNewIntegration = useCallback(
    async (credentials?: Record<string, any>) => {
      if (!provider) return;

      const integrationKey = `${provider.name}-${tenantId}-${generateId().slice(0, 6)}`;

      await startConnectFlow(integrationKey, credentials);

      try {
        const result = await listNangoProviderIntegrations(provider.name, tenantId);
        setIntegrations(result);
      } catch (error) {
        console.error('Failed to refresh integrations list:', error);
      }
    },
    [provider, tenantId, startConnectFlow]
  );

  const handleUpdateCredentials = useCallback(
    async (credentials?: Record<string, any>) => {
      if (!provider || !credentials || formMode.type !== 'update') return;

      setLoading(true);
      try {
        const payload = buildCredentialsPayload(credentials, provider.auth_mode);
        if (!payload) {
          toast.error(`Unsupported authentication mode: ${provider.auth_mode}`);
          return;
        }

        await updateNangoIntegrationCredentials({
          uniqueKey: formMode.integrationKey,
          credentials: payload,
        });

        toast.success('App credentials updated');
        setFormMode({ type: 'idle' });

        try {
          const result = await listNangoProviderIntegrations(provider.name, tenantId);
          setIntegrations(result);
        } catch (refreshError) {
          console.error('Failed to refresh integrations list:', refreshError);
        }
      } catch (error) {
        console.error('Failed to update credentials:', error);
        if (error instanceof NangoError) {
          toast.error('Failed to update credentials. Please try again.');
        } else {
          toast.error('An unexpected error occurred. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    },
    [provider, tenantId, formMode]
  );

  const handleDeleteIntegration = useCallback(
    async (uniqueKey: string) => {
      if (!provider) return;

      setLoading(true);
      try {
        await deleteNangoIntegration(uniqueKey);
        toast.success('OAuth app deleted');

        try {
          const result = await listNangoProviderIntegrations(provider.name, tenantId);
          setIntegrations(result);
        } catch {
          setIntegrations([]);
        }
      } catch (error) {
        console.error('Failed to delete OAuth app:', error);
        if (error instanceof NangoError) {
          toast.error('Failed to delete OAuth app. Please try again.');
        } else {
          toast.error('An unexpected error occurred. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    },
    [provider, tenantId]
  );

  const cancelToInterstitial = useCallback(() => setFormMode({ type: 'idle' }), []);

  useEffect(() => {
    if (!provider || loading || hasAttempted) return;
    if (!requiresCredentialForm(provider.auth_mode)) {
      startConnectFlow(`${provider.name}-${tenantId}`);
    }
  }, [provider, loading, hasAttempted, startConnectFlow, tenantId]);

  const backLink = `/${tenantId}/projects/${projectId}/credentials/new/providers` as const;

  if (providersLoading) {
    return <div className="flex items-center justify-center h-64">Loading provider...</div>;
  }

  if (!provider) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <h2 className="text-xl font-semibold">Provider not found.</h2>
        <p className="text-muted-foreground">
          The provider &quot;{decodeURIComponent(providerId)}&quot; was not found.
        </p>
        <Button asChild>
          <NextLink href={backLink}>Back to providers</NextLink>
        </Button>
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
          <Button asChild>
            <NextLink href={backLink}>Back to providers</NextLink>
          </Button>
        </div>
      </div>
    );
  }

  if (integrations === null) {
    return <div className="flex items-center justify-center h-64">Loading provider...</div>;
  }

  if (formMode.type === 'create') {
    return (
      <GenericAuthForm
        className="max-w-2xl mx-auto"
        provider={provider}
        backLink={backLink}
        onSubmit={handleCreateNewIntegration}
        onCancel={integrations.length > 0 ? cancelToInterstitial : undefined}
        loading={loading}
        mode="create"
      />
    );
  }

  if (formMode.type === 'update') {
    return (
      <GenericAuthForm
        className="max-w-2xl mx-auto"
        provider={provider}
        backLink={backLink}
        onSubmit={handleUpdateCredentials}
        onCancel={cancelToInterstitial}
        loading={loading}
        mode="update"
      />
    );
  }

  if (integrations.length === 0) {
    return (
      <GenericAuthForm
        className="max-w-2xl mx-auto"
        provider={provider}
        backLink={backLink}
        onSubmit={handleCreateNewIntegration}
        loading={loading}
        mode="create"
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <ProviderIcon provider={provider.name} size={24} />
        <div>
          <h1 className="text-lg font-medium">{provider.display_name || provider.name}</h1>
          <p className="text-sm text-muted-foreground">Choose an app to create a credential.</p>
        </div>
      </div>

      <div className="space-y-3">
        {integrations.map((integration) => (
          <button
            type="button"
            key={integration.unique_key}
            className="flex w-full items-center justify-between rounded-lg border p-4 text-left transition-colors hover:bg-accent/50 disabled:pointer-events-none disabled:opacity-50"
            onClick={() => startConnectFlow(integration.unique_key)}
            disabled={loading || !integration.areCredentialsSet}
          >
            <div className="space-y-1 min-w-0 flex-1">
              <span className="text-sm font-medium truncate block">
                {integration.display_name || integration.provider}
              </span>
              <span className="text-xs text-muted-foreground truncate block">
                {integration.unique_key}
              </span>
              {integration.maskedCredentials?.client_id && (
                <p className="text-xs text-muted-foreground">
                  Client ID: {integration.maskedCredentials.client_id}
                  {integration.maskedCredentials.client_secret && (
                    <> &middot; Secret: {integration.maskedCredentials.client_secret}</>
                  )}
                </p>
              )}
              {integration.maskedCredentials?.app_id && (
                <p className="text-xs text-muted-foreground">
                  App ID: {integration.maskedCredentials.app_id}
                </p>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="shrink-0 ml-4"
                  disabled={loading}
                  aria-label="OAuth app actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setFormMode({ type: 'update', integrationKey: integration.unique_key });
                  }}
                >
                  <Pencil />
                  Edit credentials
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(integration.unique_key);
                  }}
                >
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </button>
        ))}
      </div>

      <Button variant="outline" onClick={() => setFormMode({ type: 'create' })} disabled={loading}>
        <Plus className="h-4 w-4" />
        Configure new app
      </Button>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete OAuth app</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the OAuth app configuration and invalidate all existing
              connections using these credentials. Affected users will need to re-authenticate with
              a different OAuth app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteTarget) handleDeleteIntegration(deleteTarget);
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ProviderSetupPage;
