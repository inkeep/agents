import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface NangoConfigStatus {
  status: string;
  configured: boolean;
  error?: string;
}

export function useNangoConfig() {
  const { tenantId } = useParams();
  const [isLoading, setIsLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    const checkConfig = async () => {
      try {
        setIsLoading(true);
        // Call Next.js route which forwards to manage-api
        const response = await fetch(`/api/nango?tenantId=${tenantId}`);
        if (!response.ok) {
          throw new Error('Failed to check Nango configuration');
        }
        const data: NangoConfigStatus = await response.json();
        setConfigError(data.error || null);
      } catch (err) {
        console.error('Error checking Nango configuration:', err);
        setConfigError(err instanceof Error ? err.message : 'Failed to check Nango configuration');
      } finally {
        setIsLoading(false);
      }
    };

    if (tenantId) {
      checkConfig();
    }
  }, [tenantId]);

  return { isLoading, configError };
}
