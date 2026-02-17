'use client';

import { Github } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ErrorContent } from '@/components/errors/full-page-error';
import EmptyState from '@/components/layout/empty-state';
import { WorkAppGitHubInstallButton } from '@/components/settings/work-app-github-install-button';
import { WorkAppGitHubInstallationsList } from '@/components/settings/work-app-github-installations-list';
import type { WorkAppGitHubInstallation } from '@/lib/api/github';
import { fetchWorkAppGitHubInstallations } from '@/lib/api/github';
import GitHubSettingsLoading from './loading';

export default function WorkAppGitHubSettingsPage({
  params,
}: PageProps<'/[tenantId]/work-apps/github'>) {
  const { tenantId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [installations, setInstallations] = useState<WorkAppGitHubInstallation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadInstallations = useCallback(async () => {
    try {
      const data = await fetchWorkAppGitHubInstallations(tenantId);
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
      router.replace(`/${tenantId}/work-apps/github`);
      loadInstallations();
    } else if (status === 'error' && errorMessage) {
      toast.error('Connection failed', {
        description: decodeURIComponent(errorMessage),
      });
      router.replace(`/${tenantId}/work-apps/github`);
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
    <div className="space-y-6 h-full flex flex-col">
      {hasInstallations ? (
        <>
          <div className="flex items-center justify-end">
            <WorkAppGitHubInstallButton tenantId={tenantId} variant="outline" size="sm" />
          </div>
          <WorkAppGitHubInstallationsList
            installations={installations}
            tenantId={tenantId}
            onInstallationsChange={loadInstallations}
          />
        </>
      ) : (
        <EmptyState
          title="No GitHub connections."
          description="Connect your GitHub organization to enable repository access for your agents."
          icon={<Github strokeWidth={0.5} className="size-24 text-gray-300 dark:text-gray-700" />}
          action={<WorkAppGitHubInstallButton tenantId={tenantId} />}
        />
      )}
    </div>
  );
}
