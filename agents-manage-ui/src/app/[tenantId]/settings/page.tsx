'use client';

import type { AllowedAuthMethod } from '@inkeep/agents-core/auth/auth-types';
import { parseAllowedAuthMethods } from '@inkeep/agents-core/auth/auth-types';
import { DEFAULT_MEMBERSHIP_LIMIT } from '@inkeep/agents-core/client-exports';
import { Loader2 } from 'lucide-react';
import { use, useCallback, useEffect, useState } from 'react';
import { ErrorContent } from '@/components/errors/full-page-error';
import { AuthMethodConfiguration } from '@/components/settings/auth-method-configuration';
import {
  EditSSOForm,
  RegisterSSOForm,
  RemoveSSODialog,
  type SSOProviderInfo,
  useSSOProviders,
} from '@/components/settings/sso-configuration';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CopyableSingleLineCode } from '@/components/ui/copyable-single-line-code';
import { useAuthClient } from '@/contexts/auth-client';
import { useRuntimeConfig } from '@/contexts/runtime-config';
import { useIsOrgAdmin } from '@/hooks/use-is-org-admin';
import SettingsLoadingSkeleton from './loading';

export default function SettingsPage({ params }: PageProps<'/[tenantId]/settings'>) {
  const authClient = useAuthClient();
  const { PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT } = useRuntimeConfig();
  const isCloudDeployment = PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT === 'true';
  const { tenantId } = use(params);

  const [organization, setOrganization] = useState<
    typeof authClient.$Infer.ActiveOrganization | null
  >();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isAdmin: isOrgAdmin, isLoading: isAdminLoading } = useIsOrgAdmin();

  const [editingProvider, setEditingProvider] = useState<SSOProviderInfo | null>(null);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [removingProvider, setRemovingProvider] = useState<SSOProviderInfo | null>(null);

  const {
    providers: ssoProviders,
    loading: ssoLoading,
    refetch: refetchSSO,
  } = useSSOProviders(isCloudDeployment ? tenantId : undefined);

  const fetchOrganization = useCallback(async () => {
    if (!tenantId) return;

    try {
      const orgResult = await authClient.organization.getFullOrganization({
        query: {
          organizationId: tenantId,
          membersLimit: DEFAULT_MEMBERSHIP_LIMIT,
        },
      });

      if (orgResult.error) {
        setError(orgResult.error.message || 'Failed to fetch organization');
        return;
      }

      if (orgResult.data) {
        setOrganization(orgResult.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch organization');
    } finally {
      setLoading(false);
    }
  }, [tenantId, authClient]);

  useEffect(() => {
    fetchOrganization();
  }, [fetchOrganization]);

  if (loading || isAdminLoading) {
    return <SettingsLoadingSkeleton />;
  }

  if (error || !organization) {
    return (
      <ErrorContent
        error={new Error(error || 'Failed to load organization')}
        context="organization"
      />
    );
  }

  const allowedMethods = parseAllowedAuthMethods(organization.allowedAuthMethods);

  type SSOMethod = Extract<AllowedAuthMethod, { method: 'sso' }>;
  const findSSOEntry = (providerId: string) =>
    allowedMethods.find((m): m is SSOMethod => m.method === 'sso' && m.providerId === providerId);

  const ssoRows = ssoProviders.map((p) => {
    const entry = findSSOEntry(p.providerId);
    return {
      providerId: p.providerId,
      displayName: entry?.displayName ?? p.providerId,
      domain: p.domain,
      enabled: entry?.enabled ?? false,
      autoProvision: entry?.autoProvision ?? true,
    };
  });

  const handleRefreshAll = () => {
    fetchOrganization();
    refetchSSO();
  };

  const handleEditSSO = (providerId: string) => {
    const provider = ssoProviders.find((p) => p.providerId === providerId);
    if (provider) setEditingProvider(provider);
  };

  const handleRemoveSSO = (providerId: string) => {
    const provider = ssoProviders.find((p) => p.providerId === providerId);
    if (provider) setRemovingProvider(provider);
  };

  if (isCloudDeployment && editingProvider) {
    const entry = findSSOEntry(editingProvider.providerId);
    return (
      <div className="space-y-6">
        <EditSSOForm
          provider={editingProvider}
          organizationId={tenantId}
          currentAutoProvision={entry?.autoProvision ?? true}
          currentDisplayName={entry?.displayName ?? editingProvider.providerId}
          onSaved={() => {
            setEditingProvider(null);
            handleRefreshAll();
          }}
          onCancel={() => setEditingProvider(null)}
        />
      </div>
    );
  }

  if (isCloudDeployment && showRegisterForm) {
    return (
      <div className="space-y-6">
        <RegisterSSOForm
          organizationId={tenantId}
          organizationSlug={organization.slug}
          onRegistered={() => {
            setShowRegisterForm(false);
            handleRefreshAll();
          }}
          onCancel={() => setShowRegisterForm(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-6 rounded-lg border p-4">
        <div className="flex flex-col gap-2 flex-1">
          <p className="text-sm font-medium">Organization name</p>
          <CopyableSingleLineCode code={organization.name} />
        </div>
        <div className="flex flex-col gap-2 flex-1">
          <p className="text-sm font-medium">Organization id</p>
          <CopyableSingleLineCode code={organization.id} />
        </div>
      </div>
      {isOrgAdmin && (
        <>
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-base font-medium">Authentication Methods</CardTitle>
              <CardDescription>
                Enable one or more sign-in methods for your organization.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isCloudDeployment && ssoLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <AuthMethodConfiguration
                  organizationId={tenantId}
                  allowedAuthMethods={allowedMethods}
                  isOrgAdmin={isOrgAdmin}
                  ssoProviders={isCloudDeployment ? ssoRows : []}
                  onAuthMethodChanged={fetchOrganization}
                  onEditSSO={isCloudDeployment ? handleEditSSO : undefined}
                  onRemoveSSO={isCloudDeployment ? handleRemoveSSO : undefined}
                  onAddSSO={isCloudDeployment ? () => setShowRegisterForm(true) : undefined}
                />
              )}
            </CardContent>
          </Card>

          {isCloudDeployment && (
            <RemoveSSODialog
              provider={removingProvider}
              organizationId={tenantId}
              onClose={() => setRemovingProvider(null)}
              onRemoved={() => {
                setRemovingProvider(null);
                handleRefreshAll();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
