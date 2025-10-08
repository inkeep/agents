import { useEffect, useState } from 'react';

interface SignozConfigStatus {
  status: string;
  configured: boolean;
}

export function useSignozConfig() {
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkConfig = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/signoz');
        if (!response.ok) {
          throw new Error('Failed to check Signoz configuration');
        }
        const data: SignozConfigStatus = await response.json();
        setIsConfigured(data.configured);
        setError(null);
      } catch (err) {
        console.error('Error checking Signoz configuration:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setIsConfigured(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkConfig();
  }, []);

  return { isConfigured, isLoading, error };
}

