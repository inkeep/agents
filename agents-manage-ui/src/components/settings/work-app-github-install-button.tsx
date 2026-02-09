'use client';

import { Github, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getWorkAppGitHubInstallUrl } from '@/lib/api/github';

interface WorkAppGitHubInstallButtonProps {
  tenantId: string;
  variant?: 'default' | 'outline';
  size?: 'default' | 'sm' | 'lg';
}

export function WorkAppGitHubInstallButton({
  tenantId,
  variant = 'default',
  size = 'default',
}: WorkAppGitHubInstallButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleInstall = async () => {
    setLoading(true);
    try {
      const url = await getWorkAppGitHubInstallUrl(tenantId);
      window.open(url, '_blank');
    } catch (error) {
      toast.error('Failed to get installation URL', {
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={handleInstall} disabled={loading} variant={variant} size={size}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Github className="size-4" />}
      Connect GitHub Organization
    </Button>
  );
}
