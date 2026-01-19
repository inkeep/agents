import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface SignozConfigStatus {
  status: string;
  configured: boolean;
  error?: string;
}

export function useSignozConfig() {
  const { tenantId } = useParams();
  const [isLoading, setIsLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    // Workaround for a React Compiler limitation.
    // Todo: (BuildHIR::lowerStatement) Support ThrowStatement inside of try/catch
    async function doRequest() {
      // Call Next.js route which forwards to manage-api
      const response = await fetch(`/api/signoz?tenantId=${tenantId}`);
      if (!response.ok) {
        throw new Error('Failed to check Signoz configuration');
      }
      const data: SignozConfigStatus = await response.json();
      setConfigError(data.error || null);
    }

    const checkConfig = async () => {
      setIsLoading(true);
      try {
        await doRequest();
      } catch (err) {
        console.error('Error checking Signoz configuration:', err);
        setConfigError(err instanceof Error ? err.message : 'Failed to check SigNoz configuration');
      }
      setIsLoading(false);
    };

    if (tenantId) {
      checkConfig();
    }
  }, [tenantId]);

  return { isLoading, configError };
}
