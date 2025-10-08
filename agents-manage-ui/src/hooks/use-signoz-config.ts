import { useEffect, useState } from 'react';

interface SignozConfigStatus {
  status: string;
  configured: boolean;
  error?: string;
}

export function useSignozConfig() {
  const [isLoading, setIsLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    const checkConfig = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/signoz');
        if (!response.ok) {
          throw new Error('Failed to check Signoz configuration');
        }
        const data: SignozConfigStatus = await response.json();
        setConfigError(data.error || null);
      } catch (err) {
        console.error('Error checking Signoz configuration:', err);
        setConfigError(err instanceof Error ? err.message : 'Failed to check SigNoz configuration');
      } finally {
        setIsLoading(false);
      }
    };

    checkConfig();
  }, []);

  return { isLoading, configError };
}

