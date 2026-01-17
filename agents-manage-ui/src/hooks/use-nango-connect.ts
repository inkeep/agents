'use client';

import Nango, { type AuthOptions, type AuthSuccess, type OnConnectEvent } from '@nangohq/frontend';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';
import { useAuthClient } from '@/lib/auth-client';
import { createProviderConnectSession } from '@/lib/mcp-tools/nango';
import { useAuthSession } from './use-auth';

type OpenNangoConnectOptions = {
  sessionToken: string;
  onEvent?: OnConnectEvent;
  connectOptions?: {
    baseURL?: string;
    apiURL?: string;
  };
};

type NangoConnectInstance = {
  setSessionToken: (token: string) => void;
};

export function useNangoConnect() {
  const { PUBLIC_NANGO_SERVER_URL, PUBLIC_NANGO_CONNECT_BASE_URL } = useRuntimeConfig();

  const { user } = useAuthSession();

  const authClient = useAuthClient();

  const openNangoConnect = ({
    sessionToken,
    onEvent,
    connectOptions,
  }: OpenNangoConnectOptions): NangoConnectInstance => {
    const nango = new Nango({
      host: PUBLIC_NANGO_SERVER_URL || undefined,
    });

    const connect = nango.openConnectUI({
      baseURL: connectOptions?.baseURL || PUBLIC_NANGO_CONNECT_BASE_URL || undefined,
      apiURL: connectOptions?.apiURL || PUBLIC_NANGO_SERVER_URL || undefined,
      onEvent,
      detectClosedAuthWindow: true,
    });

    connect.setSessionToken(sessionToken);

    return connect as NangoConnectInstance;
  };

  const openNangoConnectHeadless = async ({
    mcpServerUrl,
    providerUniqueKey,
    providerDisplayName,
  }: {
    mcpServerUrl: string;
    providerUniqueKey: string;
    providerDisplayName: string;
  }): Promise<AuthSuccess> => {
    const providerName = 'mcp-generic';

    const { data: organizationData } = await authClient.organization.getFullOrganization();

    const connectSessionToken = await createProviderConnectSession({
      providerName,
      uniqueKey: providerUniqueKey,
      displayName: providerDisplayName,
      endUserId: user?.id,
      endUserEmail: user?.email,
      endUserDisplayName: user?.name,
      organizationId: organizationData?.id,
      organizationDisplayName: organizationData?.name,
    });

    const nango = new Nango({
      host: PUBLIC_NANGO_SERVER_URL || undefined,
      connectSessionToken,
    });

    try {
      const authOptions: AuthOptions = {
        detectClosedAuthWindow: true,
        params: {
          mcp_server_url: mcpServerUrl,
        },
      };

      const result = await nango.auth(providerUniqueKey, authOptions);

      return result;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Authentication failed: ${error.message}`);
      }
      throw error;
    }
  };

  return {
    openNangoConnect,
    openNangoConnectHeadless,
  };
}
