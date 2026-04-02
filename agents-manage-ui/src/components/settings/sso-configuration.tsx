'use client';

import type { SSOPlugin } from '@better-auth/sso';
import type { AllowedAuthMethod } from '@inkeep/agents-core/auth/auth-types';
import { parseAllowedAuthMethods } from '@inkeep/agents-core/auth/auth-types';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CopyableSingleLineCode } from '@/components/ui/copyable-single-line-code';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useAuthClient } from '@/contexts/auth-client';
import { useRuntimeConfig } from '@/contexts/runtime-config';
import { generateId } from '@/lib/utils/id-utils';

function generateProviderId(organizationSlug: string): string {
  return `${organizationSlug}-${generateId(6)}`;
}

function buildCallbackUrl(apiBaseUrl: string, providerId: string): string {
  return `${apiBaseUrl}/api/auth/sso/callback/${providerId}`;
}

type SSOProviderFromAPI = Awaited<
  ReturnType<SSOPlugin<{}>['endpoints']['listSSOProviders']>
>['providers'][number];

const DEFAULT_OIDC_SCOPES = ['openid', 'email', 'profile', 'offline_access'];

export interface SSOProviderInfo {
  providerId: string;
  issuer: string;
  domain: string;
  clientIdLastFour?: string;
  scopes?: string[];
}

export function useSSOProviders(organizationId: string | undefined) {
  const authClient = useAuthClient();
  const [providers, setProviders] = useState<SSOProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProviders = useCallback(async () => {
    if (!organizationId) {
      setProviders([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const result = await authClient.sso.providers();
      const allProviders = result.data?.providers;

      if (Array.isArray(allProviders)) {
        const orgProviders = allProviders
          .filter((p: SSOProviderFromAPI) => p.organizationId === organizationId)
          .map(
            (p: SSOProviderFromAPI): SSOProviderInfo => ({
              providerId: p.providerId,
              issuer: p.issuer,
              domain: p.domain,
              clientIdLastFour: p.oidcConfig?.clientIdLastFour,
              scopes: p.oidcConfig?.scopes ?? undefined,
            })
          );
        setProviders(orgProviders);
      }
    } catch {
      setProviders([]);
    }
    setLoading(false);
  }, [authClient, organizationId]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  return { providers, loading, refetch: fetchProviders };
}

interface RemoveSSODialogProps {
  provider: SSOProviderInfo | null;
  organizationId: string;
  onClose: () => void;
  onRemoved: () => void;
}

export function RemoveSSODialog({
  provider,
  organizationId,
  onClose,
  onRemoved,
}: RemoveSSODialogProps) {
  const authClient = useAuthClient();

  const handleRemove = async () => {
    if (!provider) return;

    try {
      const orgResult = await authClient.organization.getFullOrganization({
        query: { organizationId },
      });
      const currentRaw = orgResult.data?.allowedAuthMethods;
      const current = parseAllowedAuthMethods(currentRaw);
      const updated = current.filter(
        (m) => !(m.method === 'sso' && m.providerId === provider.providerId)
      );

      const hasRemainingMethod =
        updated.some((m) => m.method === 'email-password') ||
        updated.some((m) => m.method === 'google') ||
        updated.some((m) => m.method === 'sso' && m.enabled);

      if (!hasRemainingMethod) {
        toast.error(
          'At least one sign-in method must remain enabled. Enable another method before removing this provider.'
        );
        return;
      }

      await authClient.sso.deleteProvider({ providerId: provider.providerId });

      try {
        await authClient.organization.update({
          data: { allowedAuthMethods: JSON.stringify(updated) },
          organizationId,
        });
      } catch {
        // best-effort allowedAuthMethods cleanup
      }

      toast.success('SSO provider removed');
      onRemoved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove SSO provider');
    }
  };

  return (
    <Dialog open={!!provider} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Remove SSO Provider</DialogTitle>
          <DialogDescription>
            Are you sure you want to remove the SSO provider &ldquo;{provider?.providerId}&rdquo;?
            This will delete the provider configuration. Members who use this provider to sign in
            will need to use another authentication method.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleRemove}>
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface RegisterSSOFormProps {
  organizationId: string;
  organizationSlug: string;
  onRegistered: () => void;
  onCancel: () => void;
}

export function RegisterSSOForm({
  organizationId,
  organizationSlug,
  onRegistered,
  onCancel,
}: RegisterSSOFormProps) {
  const authClient = useAuthClient();
  const { PUBLIC_INKEEP_AGENTS_API_URL } = useRuntimeConfig();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [autoProvision, setAutoProvision] = useState(true);

  const [oidcForm, setOidcForm] = useState({
    domain: '',
    issuer: '',
    clientId: '',
    clientSecret: '',
    scopes: DEFAULT_OIDC_SCOPES.join(', '),
  });

  const providerId = useMemo(() => generateProviderId(organizationSlug), [organizationSlug]);
  const callbackUrl = buildCallbackUrl(PUBLIC_INKEEP_AGENTS_API_URL, providerId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const name = displayName.trim();
      if (!name) {
        setError('Display name is required');
        setIsSubmitting(false);
        return;
      }

      const parsedScopes = oidcForm.scopes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const result = await authClient.sso.register({
        providerId,
        issuer: oidcForm.issuer,
        domain: oidcForm.domain,
        organizationId,
        oidcConfig: {
          clientId: oidcForm.clientId,
          clientSecret: oidcForm.clientSecret,
          scopes: parsedScopes,
        },
      });

      if (result?.error) {
        setError(result.error.message || 'Failed to register SSO provider');
        setIsSubmitting(false);
        return;
      }

      const orgResult = await authClient.organization.getFullOrganization({
        query: { organizationId },
      });
      const currentMethods = parseAllowedAuthMethods(orgResult.data?.allowedAuthMethods);
      currentMethods.push({
        method: 'sso',
        providerId,
        displayName: name,
        autoProvision,
        enabled: true,
      });

      await authClient.organization.update({
        data: { allowedAuthMethods: JSON.stringify(currentMethods) },
        organizationId,
      });

      toast.success('SSO provider configured successfully');
      onRegistered();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register SSO provider');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">Add SSO Provider</CardTitle>
        <CardDescription>
          Configure enterprise SSO to allow your team to sign in with your identity provider.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <div className="space-y-5">
            {error && (
              <Alert variant="destructive" className="border-destructive/10 dark:border-border">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-2">
              <Label htmlFor="sso-display-name">Provider Name</Label>
              <Input
                id="sso-display-name"
                placeholder="Okta"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={isSubmitting}
                required
              />
              <p className="text-xs text-muted-foreground">
                A name for this provider, shown to users on the login page
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="oidc-domain">Email Domain</Label>
              <Input
                id="oidc-domain"
                placeholder="acmecorp.com"
                value={oidcForm.domain}
                onChange={(e) => setOidcForm({ ...oidcForm, domain: e.target.value })}
                disabled={isSubmitting}
                required
              />
              <p className="text-xs text-muted-foreground">
                Users with this email domain will be redirected to your IdP
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="oidc-issuer">Issuer URL</Label>
              <Input
                id="oidc-issuer"
                placeholder="https://your-org.okta.com"
                value={oidcForm.issuer}
                onChange={(e) => setOidcForm({ ...oidcForm, issuer: e.target.value })}
                disabled={isSubmitting}
                required
              />
              <p className="text-xs text-muted-foreground">
                OIDC discovery will be auto-detected from this URL
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="oidc-client-id">Client ID</Label>
                <Input
                  id="oidc-client-id"
                  placeholder="your-client-id"
                  value={oidcForm.clientId}
                  onChange={(e) => setOidcForm({ ...oidcForm, clientId: e.target.value })}
                  disabled={isSubmitting}
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="oidc-client-secret">Client Secret</Label>
                <Input
                  id="oidc-client-secret"
                  type="password"
                  placeholder="your-client-secret"
                  value={oidcForm.clientSecret}
                  onChange={(e) => setOidcForm({ ...oidcForm, clientSecret: e.target.value })}
                  disabled={isSubmitting}
                  required
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="oidc-scopes">Scopes</Label>
              <Input
                id="oidc-scopes"
                value={oidcForm.scopes}
                onChange={(e) => setOidcForm({ ...oidcForm, scopes: e.target.value })}
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated OIDC scopes. Remove <code>offline_access</code> for Google
                Workspace.
              </p>
            </div>

            <Separator />

            <div className="grid gap-2">
              <Label>Callback / Redirect URI</Label>
              <CopyableSingleLineCode code={callbackUrl} />
              <p className="text-xs text-muted-foreground">
                Add this URL as the sign-in redirect URI in your identity provider
              </p>
            </div>

            <Separator />

            <div className="space-y-1 py-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="register-auto-provision-toggle" className="text-sm font-medium">
                  Auto-provision members
                </Label>
                <Switch
                  id="register-auto-provision-toggle"
                  checked={autoProvision}
                  onCheckedChange={setAutoProvision}
                  disabled={isSubmitting}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {autoProvision
                  ? 'Users are automatically added as members on their first SSO sign-in.'
                  : 'Users must be invited before they can access this organization.'}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Configuring...
                  </>
                ) : (
                  'Configure SSO'
                )}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

interface EditSSOFormProps {
  provider: SSOProviderInfo;
  organizationId: string;
  currentAutoProvision: boolean;
  currentDisplayName: string;
  onSaved: () => void;
  onCancel: () => void;
}

export function EditSSOForm({
  provider,
  organizationId,
  currentAutoProvision,
  currentDisplayName,
  onSaved,
  onCancel,
}: EditSSOFormProps) {
  const authClient = useAuthClient();
  const { PUBLIC_INKEEP_AGENTS_API_URL } = useRuntimeConfig();
  const callbackUrl = buildCallbackUrl(PUBLIC_INKEEP_AGENTS_API_URL, provider.providerId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(currentDisplayName);
  const [autoProvision, setAutoProvision] = useState(currentAutoProvision);

  const [oidcForm, setOidcForm] = useState({
    domain: provider.domain,
    issuer: provider.issuer,
    clientId: '',
    clientSecret: '',
    scopes: (provider.scopes ?? DEFAULT_OIDC_SCOPES).join(', '),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const parsedScopes = oidcForm.scopes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const oidcConfig = {
        ...(oidcForm.clientId && { clientId: oidcForm.clientId }),
        ...(oidcForm.clientSecret && { clientSecret: oidcForm.clientSecret }),
        scopes: parsedScopes,
      };

      const result = await authClient.sso.updateProvider({
        providerId: provider.providerId,
        issuer: oidcForm.issuer,
        domain: oidcForm.domain,
        oidcConfig,
      });

      if (result?.error) {
        setError(result.error.message || 'Failed to update SSO provider');
        setIsSubmitting(false);
        return;
      }

      const nameChanged = displayName.trim() !== currentDisplayName;
      const provisionChanged = autoProvision !== currentAutoProvision;
      if (nameChanged || provisionChanged) {
        const orgResult = await authClient.organization.getFullOrganization({
          query: { organizationId },
        });
        const raw = orgResult.data?.allowedAuthMethods;
        if (raw) {
          try {
            const methods = JSON.parse(raw) as AllowedAuthMethod[];
            const updated = methods.map((m) => {
              if (m.method === 'sso' && m.providerId === provider.providerId) {
                return {
                  ...m,
                  ...(nameChanged && { displayName: displayName.trim() || provider.providerId }),
                  ...(provisionChanged && { autoProvision }),
                };
              }
              return m;
            });
            await authClient.organization.update({
              data: { allowedAuthMethods: JSON.stringify(updated) },
              organizationId,
            });
          } catch {
            // best-effort
          }
        }
      }

      toast.success('SSO configuration updated');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update SSO provider');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">Edit SSO Configuration</CardTitle>
        <CardDescription>Update your SSO provider settings.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <div className="space-y-5">
            {error && (
              <Alert variant="destructive" className="border-destructive/10 dark:border-border">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-2">
              <Label htmlFor="edit-display-name">Display Name</Label>
              <Input
                id="edit-display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">Shown to users on the login page</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-oidc-domain">Email Domain</Label>
              <Input
                id="edit-oidc-domain"
                value={oidcForm.domain}
                onChange={(e) => setOidcForm({ ...oidcForm, domain: e.target.value })}
                disabled={isSubmitting}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-oidc-issuer">Issuer URL</Label>
              <Input
                id="edit-oidc-issuer"
                value={oidcForm.issuer}
                onChange={(e) => setOidcForm({ ...oidcForm, issuer: e.target.value })}
                disabled={isSubmitting}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-oidc-client-id">Client ID</Label>
                <Input
                  id="edit-oidc-client-id"
                  placeholder={
                    provider.clientIdLastFour
                      ? `Current: ****${provider.clientIdLastFour}`
                      : 'Leave empty to keep current'
                  }
                  value={oidcForm.clientId}
                  onChange={(e) => setOidcForm({ ...oidcForm, clientId: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit-oidc-client-secret">Client Secret</Label>
                <Input
                  id="edit-oidc-client-secret"
                  type="password"
                  placeholder="Leave empty to keep current"
                  value={oidcForm.clientSecret}
                  onChange={(e) => setOidcForm({ ...oidcForm, clientSecret: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-oidc-scopes">Scopes</Label>
              <Input
                id="edit-oidc-scopes"
                value={oidcForm.scopes}
                onChange={(e) => setOidcForm({ ...oidcForm, scopes: e.target.value })}
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated OIDC scopes. Remove <code>offline_access</code> for Google
                Workspace.
              </p>
            </div>

            <Separator />

            <div className="grid gap-2">
              <Label>Callback / Redirect URI</Label>
              <CopyableSingleLineCode code={callbackUrl} />
              <p className="text-xs text-muted-foreground">
                Add this URL as the sign-in redirect URI in your identity provider
              </p>
            </div>

            <Separator />

            <div className="space-y-1 py-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-auto-provision-toggle" className="text-sm font-medium">
                  Auto-provision members
                </Label>
                <Switch
                  id="edit-auto-provision-toggle"
                  checked={autoProvision}
                  onCheckedChange={setAutoProvision}
                  disabled={isSubmitting}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {autoProvision
                  ? 'Users are automatically added as members on their first SSO sign-in.'
                  : 'Users must be invited before they can access this organization.'}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
