import type { WorkAppGitHubAccountType } from '../api/github';

export function getGitHubInstallationSettingsUrl(
  installationId: number,
  accountType: WorkAppGitHubAccountType,
  accountLogin: string
): string {
  if (accountType === 'Organization') {
    return `https://github.com/organizations/${accountLogin}/settings/installations/${installationId}`;
  }
  return `https://github.com/settings/installations/${installationId}`;
}
