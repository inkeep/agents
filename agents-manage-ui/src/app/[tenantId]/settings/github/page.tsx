'use client';

import { Github } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ErrorContent } from '@/components/errors/full-page-error';
import EmptyState from '@/components/layout/empty-state';
import { GitHubInstallButton } from '@/components/settings/github-install-button';
import { GitHubInstallationsList } from '@/components/settings/github-installations-list';
import type { GitHubInstallation } from '@/lib/api/github';
import { fetchGitHubInstallations } from '@/lib/api/github';
import GitHubSettingsLoading from './loading';

interface PageParams {
  params: Promise<{ tenantId: string }>;
}

export default function GitHubSettingsPage({ params }: PageParams) {
  const { tenantId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [installations, setInstallations] = useState<GitHubInstallation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadInstallations = useCallback(async () => {
    try {
      const data = await fetchGitHubInstallations(tenantId);
      setInstallations(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch GitHub installations');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadInstallations();
  }, [loadInstallations]);

  useEffect(() => {
    const status = searchParams.get('status');
    const installationId = searchParams.get('installation_id');
    const errorMessage = searchParams.get('message');

    if (status === 'success' && installationId) {
      toast.success('GitHub connected', {
        description: 'Your GitHub organization has been connected successfully.',
      });
      router.replace(`/${tenantId}/settings/github`);
      loadInstallations();
    } else if (status === 'error' && errorMessage) {
      toast.error('Connection failed', {
        description: decodeURIComponent(errorMessage),
      });
      router.replace(`/${tenantId}/settings/github`);
    }
  }, [searchParams, router, tenantId, loadInstallations]);

  if (loading) {
    return <GitHubSettingsLoading />;
  }

  if (error) {
    return <ErrorContent error={new Error(error)} context="github" />;
  }

  const hasInstallations = installations && installations.length > 0;

  return (
    <div className="space-y-6">
      {hasInstallations ? (
        <>
          <div className="flex items-center justify-end">
            <GitHubInstallButton tenantId={tenantId} variant="outline" size="sm" />
          </div>
          <GitHubInstallationsList
            installations={installations}
            tenantId={tenantId}
            onInstallationsChange={loadInstallations}
          />
        </>
      ) : (
        <EmptyState
          title="No GitHub connections"
          description="Connect your GitHub organization to enable repository access for your agents."
          icon={
            <div className="flex size-24 items-center justify-center rounded-full bg-muted">
              <Github className="size-12 text-muted-foreground" />
            </div>
          }
          action={<GitHubInstallButton tenantId={tenantId} />}
        />
      )}
    </div>
  );
}
