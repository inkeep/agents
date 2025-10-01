import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';
import { getOAuthLoginUrl } from '@/lib/utils/mcp-urls';

interface UseOAuthLoginProps {
  tenantId: string;
  projectId: string;
  onSuccess?: (toolId: string) => void;
  onError?: (error: Error) => void;
}

export function useOAuthLogin({ tenantId, projectId, onSuccess, onError }: UseOAuthLoginProps) {
  const router = useRouter();
  const { INKEEP_AGENTS_MANAGE_API_URL } = useRuntimeConfig();

  const handleOAuthLogin = (toolId: string) => {
    try {
      // Get the OAuth URL and open in popup window
      const oauthUrl = getOAuthLoginUrl({
        INKEEP_AGENTS_MANAGE_API_URL,
        tenantId,
        projectId,
        id: toolId,
      });
      const popup = window.open(
        oauthUrl,
        'oauth-popup',
        'width=600,height=700,scrollbars=yes,resizable=yes,status=yes,location=yes'
      );

      // Listen for OAuth success message from popup
      const handleMessage = (event: MessageEvent) => {
        if (event.data.type === 'oauth-success' && event.data.toolId === toolId) {
          // Clean up listener
          window.removeEventListener('message', handleMessage);

          // Call custom success handler or default behavior
          if (onSuccess) {
            onSuccess(toolId);
          } else {
            // Default: navigate to server details page
            router.push(`/${tenantId}/projects/${projectId}/mcp-servers/${toolId}`);
          }
        }
      };

      if (popup) {
        window.addEventListener('message', handleMessage);

        // Fallback: Monitor popup for closure
        const checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed);
            window.removeEventListener('message', handleMessage);

            // Call custom success handler or default behavior
            if (onSuccess) {
              onSuccess(toolId);
            } else {
              // Default: navigate to server details page
              router.push(`/${tenantId}/projects/${projectId}/mcp-servers/${toolId}`);
            }
          }
        }, 1000);
      }
    } catch (error) {
      console.error('OAuth login failed:', error);
      const errorObj = error instanceof Error ? error : new Error('OAuth login failed');

      if (onError) {
        onError(errorObj);
      } else {
        // Default error handling
        toast.error('OAuth login failed. Please try again.');
      }
    }
  };

  return { handleOAuthLogin };
}
