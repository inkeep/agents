'use client';

import type { AllowedAuthMethod } from '@inkeep/agents-core/auth/auth-types';
import { Globe, Mail, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { useAuthClient } from '@/contexts/auth-client';
import { useRuntimeConfig } from '@/contexts/runtime-config';
import { GoogleColorIcon } from '../icons/google';

interface SSOProviderRow {
  providerId: string;
  displayName: string;
  domain: string;
  enabled: boolean;
  autoProvision: boolean;
}

interface AuthMethodConfigurationProps {
  organizationId: string;
  allowedAuthMethods: AllowedAuthMethod[];
  isOrgAdmin: boolean;
  ssoProviders: SSOProviderRow[];
  onAuthMethodChanged?: () => void;
  onEditSSO?: (providerId: string) => void;
  onRemoveSSO?: (providerId: string) => void;
  onAddSSO?: () => void;
}

export function AuthMethodConfiguration({
  organizationId,
  allowedAuthMethods,
  isOrgAdmin,
  ssoProviders,
  onAuthMethodChanged,
  onEditSSO,
  onRemoveSSO,
  onAddSSO,
}: AuthMethodConfigurationProps) {
  const authClient = useAuthClient();
  const { PUBLIC_GOOGLE_CLIENT_ID } = useRuntimeConfig();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isEmailPasswordEnabled = allowedAuthMethods.some((m) => m.method === 'email-password');
  const isGoogleEnabled = allowedAuthMethods.some((m) => m.method === 'google');

  const enabledSSOCount = allowedAuthMethods.filter(
    (m): m is Extract<AllowedAuthMethod, { method: 'sso' }> => m.method === 'sso' && m.enabled
  ).length;

  const enabledMethodCount =
    (isEmailPasswordEnabled ? 1 : 0) + (isGoogleEnabled ? 1 : 0) + enabledSSOCount;

  const isLastMethod = enabledMethodCount <= 1;

  const persistMethods = async (methods: AllowedAuthMethod[]) => {
    setIsSubmitting(true);
    try {
      await authClient.organization.update({
        data: { allowedAuthMethods: JSON.stringify(methods) },
        organizationId,
      });
      onAuthMethodChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update authentication methods');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleEmailPassword = async () => {
    if (isEmailPasswordEnabled) {
      if (isLastMethod) {
        toast.error('At least one sign-in method must remain enabled.');
        return;
      }
      const updated = allowedAuthMethods.filter((m) => m.method !== 'email-password');
      await persistMethods(updated);
      toast.success('Email and password sign-in disabled');
    } else {
      const updated: AllowedAuthMethod[] = [{ method: 'email-password' }, ...allowedAuthMethods];
      await persistMethods(updated);
      toast.success('Email and password sign-in enabled');
    }
  };

  const handleToggleGoogle = async () => {
    if (isGoogleEnabled) {
      if (isLastMethod) {
        toast.error('At least one sign-in method must remain enabled.');
        return;
      }
      const updated = allowedAuthMethods.filter((m) => m.method !== 'google');
      await persistMethods(updated);
      toast.success('Google sign-in disabled');
    } else {
      const updated = [...allowedAuthMethods, { method: 'google' as const }];
      await persistMethods(updated);
      toast.success('Google sign-in enabled');
    }
  };

  const handleToggleSSO = async (provider: SSOProviderRow) => {
    const nowEnabled = !provider.enabled;

    if (!nowEnabled && isLastMethod) {
      toast.error('At least one sign-in method must remain enabled.');
      return;
    }

    const existing = allowedAuthMethods.find(
      (m): m is Extract<AllowedAuthMethod, { method: 'sso' }> =>
        m.method === 'sso' && m.providerId === provider.providerId
    );

    let updated: AllowedAuthMethod[];
    if (existing) {
      updated = allowedAuthMethods.map((m) =>
        m.method === 'sso' && m.providerId === provider.providerId
          ? { ...m, enabled: nowEnabled }
          : m
      );
    } else {
      updated = [
        ...allowedAuthMethods,
        {
          method: 'sso' as const,
          providerId: provider.providerId,
          displayName: provider.displayName,
          autoProvision: provider.autoProvision,
          enabled: nowEnabled,
        },
      ];
    }

    await persistMethods(updated);
    toast.success(`${provider.displayName} ${nowEnabled ? 'enabled' : 'disabled'}`);
  };

  if (!isOrgAdmin) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="flex items-center gap-3">
          <Mail className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Email and password</p>
            <p className="text-xs text-muted-foreground">
              Members can sign in with their email and password.
            </p>
          </div>
        </div>
        <Switch
          checked={isEmailPasswordEnabled}
          onCheckedChange={handleToggleEmailPassword}
          disabled={isSubmitting}
          aria-label="Toggle email and password sign-in"
        />
      </div>

      {PUBLIC_GOOGLE_CLIENT_ID && (
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="flex items-center gap-3">
            <GoogleColorIcon className="h-5 w-5 shrink-0" />
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Google</p>
              <p className="text-xs text-muted-foreground">
                Members can sign in with their Google account.
              </p>
            </div>
          </div>
          <Switch
            checked={isGoogleEnabled}
            onCheckedChange={handleToggleGoogle}
            disabled={isSubmitting}
            aria-label="Toggle Google sign-in"
          />
        </div>
      )}

      {[...ssoProviders]
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
        .map((provider) => (
          <div
            key={provider.providerId}
            className="flex items-center justify-between rounded-lg border p-3"
          >
            <div className="flex items-center gap-3">
              <Globe className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium">{provider.displayName}</p>
                <p className="text-xs text-muted-foreground">
                  OIDC &middot; {provider.domain} &middot; Auto-provision{' '}
                  {provider.autoProvision ? 'enabled' : 'disabled'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    aria-label={`Actions for ${provider.displayName}`}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEditSSO?.(provider.providerId)}>
                    <Pencil className="h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onRemoveSSO?.(provider.providerId)}
                    variant="destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Switch
                checked={provider.enabled}
                onCheckedChange={() => handleToggleSSO(provider)}
                disabled={isSubmitting}
                aria-label={`Toggle ${provider.displayName}`}
              />
            </div>
          </div>
        ))}

      {onAddSSO && (
        <button
          type="button"
          onClick={onAddSSO}
          className="flex items-center justify-center gap-2 w-full rounded-lg border border-dashed p-3 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          Add SSO Provider
        </button>
      )}
    </div>
  );
}
