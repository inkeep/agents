'use client';

import Nango, { type OnConnectEvent } from '@nangohq/frontend';
import { useCallback } from 'react';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';

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
  const { NANGO_SERVER_URL, NANGO_CONNECT_BASE_URL } = useRuntimeConfig();

  const openNangoConnect = useCallback(
    ({ sessionToken, onEvent, connectOptions }: OpenNangoConnectOptions): NangoConnectInstance => {
      const nango = new Nango({
        host: NANGO_SERVER_URL || undefined,
      });

      const connect = nango.openConnectUI({
        baseURL: connectOptions?.baseURL || NANGO_CONNECT_BASE_URL || undefined,
        apiURL: connectOptions?.apiURL || NANGO_SERVER_URL || undefined,
        onEvent,
        detectClosedAuthWindow: true,
      });

      connect.setSessionToken(sessionToken);

      return connect as NangoConnectInstance;
    },
    [NANGO_SERVER_URL, NANGO_CONNECT_BASE_URL]
  );

  return openNangoConnect;
}
