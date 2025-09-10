"use client";

import type { ApiProvider } from "@nangohq/types";
import { useEffect, useState } from "react";
import { fetchNangoProviders } from "@/lib/mcp-tools/nango";

export function useNangoProviders() {
	const [providers, setProviders] = useState<ApiProvider[] | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		async function loadProviders() {
			try {
				setLoading(true);
				setError(null);

				const data = await fetchNangoProviders();
				setProviders(data);
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to load providers",
				);
				setProviders([]);
			} finally {
				setLoading(false);
			}
		}

		loadProviders();
	}, []);

	return { providers, loading, error };
}
