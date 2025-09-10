"use client";

import Nango, { type OnConnectEvent } from "@nangohq/frontend";
import { useCallback } from "react";

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
	const openNangoConnect = useCallback(
		({
			sessionToken,
			onEvent,
			connectOptions,
		}: OpenNangoConnectOptions): NangoConnectInstance => {
			const nango = new Nango({
				host: process.env.NEXT_PUBLIC_NANGO_HOST || undefined,
			});

			const connect = nango.openConnectUI({
				baseURL:
					connectOptions?.baseURL ||
					process.env.NEXT_PUBLIC_NANGO_CONNECT_BASE_URL ||
					undefined,
				apiURL:
					connectOptions?.apiURL ||
					process.env.NEXT_PUBLIC_NANGO_HOST ||
					undefined,
				onEvent,
				detectClosedAuthWindow: true,
			});

			connect.setSessionToken(sessionToken);

			return connect as NangoConnectInstance;
		},
		[],
	);

	return openNangoConnect;
}
