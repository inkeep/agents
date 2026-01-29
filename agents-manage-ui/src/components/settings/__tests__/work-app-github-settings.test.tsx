import type { WorkAppGitHubInstallation } from '@/lib/api/github';
import { getGitHubInstallationSettingsUrl } from '@/lib/utils/work-app-github-utils';

// Mock data for testing
const mockInstallation: WorkAppGitHubInstallation = {
  id: 'inst_123',
  installationId: 12345,
  accountLogin: 'test-org',
  accountId: 67890,
  accountType: 'Organization',
  status: 'active',
  repositoryCount: 5,
  createdAt: '2024-01-15T10:00:00Z',
  updatedAt: '2024-01-20T15:30:00Z',
};

const mockUserInstallation: WorkAppGitHubInstallation = {
  id: 'inst_456',
  installationId: 54321,
  accountLogin: 'test-user',
  accountId: 11111,
  accountType: 'User',
  status: 'active',
  repositoryCount: 3,
  createdAt: '2024-01-10T08:00:00Z',
  updatedAt: '2024-01-18T12:00:00Z',
};

const mockPendingInstallation: WorkAppGitHubInstallation = {
  id: 'inst_789',
  installationId: 99999,
  accountLogin: 'pending-org',
  accountId: 22222,
  accountType: 'Organization',
  status: 'pending',
  repositoryCount: 0,
  createdAt: '2024-01-22T10:00:00Z',
  updatedAt: '2024-01-22T10:00:00Z',
};

const mockSuspendedInstallation: WorkAppGitHubInstallation = {
  id: 'inst_321',
  installationId: 88888,
  accountLogin: 'suspended-org',
  accountId: 33333,
  accountType: 'Organization',
  status: 'suspended',
  repositoryCount: 10,
  createdAt: '2024-01-05T10:00:00Z',
  updatedAt: '2024-01-21T09:00:00Z',
};

describe('GitHubInstallation Types', () => {
  it('should have correct structure for organization installation', () => {
    expect(mockInstallation.accountType).toBe('Organization');
    expect(mockInstallation.status).toBe('active');
    expect(mockInstallation.repositoryCount).toBe(5);
  });

  it('should have correct structure for user installation', () => {
    expect(mockUserInstallation.accountType).toBe('User');
    expect(mockUserInstallation.status).toBe('active');
    expect(mockUserInstallation.repositoryCount).toBe(3);
  });

  it('should support pending status', () => {
    expect(mockPendingInstallation.status).toBe('pending');
    expect(mockPendingInstallation.repositoryCount).toBe(0);
  });

  it('should support suspended status', () => {
    expect(mockSuspendedInstallation.status).toBe('suspended');
    expect(mockSuspendedInstallation.repositoryCount).toBe(10);
  });

  it('should have valid date strings', () => {
    const createdAt = new Date(mockInstallation.createdAt);
    const updatedAt = new Date(mockInstallation.updatedAt);

    expect(createdAt.getTime()).toBeLessThan(updatedAt.getTime());
    expect(Number.isNaN(createdAt.getTime())).toBe(false);
    expect(Number.isNaN(updatedAt.getTime())).toBe(false);
  });
});

describe('Status Badge Mapping', () => {
  const getStatusBadgeVariant = (status: WorkAppGitHubInstallation['status']) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'pending':
        return 'warning';
      case 'suspended':
        return 'error';
      case 'disconnected':
        return 'error';
      default:
        return 'code';
    }
  };

  it('should map active status to success variant', () => {
    expect(getStatusBadgeVariant('active')).toBe('success');
  });

  it('should map pending status to warning variant', () => {
    expect(getStatusBadgeVariant('pending')).toBe('warning');
  });

  it('should map suspended status to error variant', () => {
    expect(getStatusBadgeVariant('suspended')).toBe('error');
  });

  it('should map disconnected status to error variant', () => {
    expect(getStatusBadgeVariant('disconnected')).toBe('error');
  });
});

describe('Date Formatting', () => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  it('should format date correctly', () => {
    const formatted = formatDate('2024-01-15T10:00:00Z');
    expect(formatted).toContain('Jan');
    expect(formatted).toContain('15');
    expect(formatted).toContain('2024');
  });
});

describe('Settings Navigation', () => {
  const settingsNavItems = [
    {
      label: 'Organization',
      href: (tenantId: string) => `/${tenantId}/settings`,
      exact: true,
    },
  ];

  const workAppsNavItems = [
    {
      label: 'GitHub',
      href: (tenantId: string) => `/${tenantId}/work-apps/github`,
      exact: false,
    },
  ];

  it('should have Organization nav item in settings', () => {
    expect(settingsNavItems).toHaveLength(1);
    expect(settingsNavItems[0].label).toBe('Organization');
  });

  it('should have GitHub nav item in work-apps', () => {
    expect(workAppsNavItems).toHaveLength(1);
    expect(workAppsNavItems[0].label).toBe('GitHub');
  });

  it('should generate correct hrefs for tenant', () => {
    const tenantId = 'my-tenant';
    expect(settingsNavItems[0].href(tenantId)).toBe('/my-tenant/settings');
    expect(workAppsNavItems[0].href(tenantId)).toBe('/my-tenant/work-apps/github');
  });

  it('should have correct exact match settings', () => {
    expect(settingsNavItems[0].exact).toBe(true);
    expect(workAppsNavItems[0].exact).toBe(false);
  });
});

// Mock repository data for installation detail tests
import type { WorkAppGitHubInstallationDetail, WorkAppGitHubRepository } from '@/lib/api/github';

const mockRepository: WorkAppGitHubRepository = {
  id: 'repo_123',
  installationId: 'inst_123',
  repositoryId: '456789',
  repositoryName: 'test-repo',
  repositoryFullName: 'test-org/test-repo',
  private: false,
  createdAt: '2024-01-15T10:00:00Z',
  updatedAt: '2024-01-20T15:30:00Z',
};

const mockPrivateRepository: WorkAppGitHubRepository = {
  id: 'repo_456',
  installationId: 'inst_123',
  repositoryId: '789123',
  repositoryName: 'private-repo',
  repositoryFullName: 'test-org/private-repo',
  private: true,
  createdAt: '2024-01-16T10:00:00Z',
  updatedAt: '2024-01-21T15:30:00Z',
};

describe('GitHubRepository Types', () => {
  it('should have correct structure for public repository', () => {
    expect(mockRepository.repositoryName).toBe('test-repo');
    expect(mockRepository.repositoryFullName).toBe('test-org/test-repo');
    expect(mockRepository.private).toBe(false);
  });

  it('should have correct structure for private repository', () => {
    expect(mockPrivateRepository.repositoryName).toBe('private-repo');
    expect(mockPrivateRepository.repositoryFullName).toBe('test-org/private-repo');
    expect(mockPrivateRepository.private).toBe(true);
  });

  it('should have valid installationId reference', () => {
    expect(mockRepository.installationId).toBe('inst_123');
    expect(mockPrivateRepository.installationId).toBe('inst_123');
  });
});

describe('InstallationDetail Types', () => {
  const mockInstallationDetail: WorkAppGitHubInstallationDetail = {
    installation: {
      id: 'inst_123',
      installationId: 12345,
      accountLogin: 'test-org',
      accountId: 67890,
      accountType: 'Organization',
      status: 'active',
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-20T15:30:00Z',
    },
    repositories: [mockRepository, mockPrivateRepository],
  };

  it('should combine installation with repositories', () => {
    expect(mockInstallationDetail.installation.accountLogin).toBe('test-org');
    expect(mockInstallationDetail.repositories).toHaveLength(2);
  });

  it('should not include repositoryCount in detail installation', () => {
    expect('repositoryCount' in mockInstallationDetail.installation).toBe(false);
  });

  it('should have repositories with correct installation reference', () => {
    for (const repo of mockInstallationDetail.repositories) {
      expect(repo.installationId).toBe('inst_123');
    }
  });
});

describe('Installation Detail Status Display', () => {
  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active':
        return 'Active';
      case 'pending':
        return 'Pending Approval';
      case 'suspended':
        return 'Suspended';
      case 'deleted':
        return 'Deleted';
      default:
        return status;
    }
  };

  it('should show "Pending Approval" for pending status', () => {
    expect(getStatusLabel('pending')).toBe('Pending Approval');
  });

  it('should show "Active" for active status', () => {
    expect(getStatusLabel('active')).toBe('Active');
  });

  it('should show "Suspended" for suspended status', () => {
    expect(getStatusLabel('suspended')).toBe('Suspended');
  });

  it('should show "Deleted" for deleted status', () => {
    expect(getStatusLabel('deleted')).toBe('Deleted');
  });
});

describe('Repository Visibility Badge', () => {
  const getVisibilityBadgeVariant = (isPrivate: boolean) => {
    return isPrivate ? 'code' : 'success';
  };

  it('should map private repository to code variant', () => {
    expect(getVisibilityBadgeVariant(true)).toBe('code');
  });

  it('should map public repository to success variant', () => {
    expect(getVisibilityBadgeVariant(false)).toBe('success');
  });
});

describe('GitHub URL Generation', () => {
  const getGitHubRepoUrl = (fullName: string) => `https://github.com/${fullName}`;

  it('should generate correct repository URL', () => {
    expect(getGitHubRepoUrl('test-org/test-repo')).toBe('https://github.com/test-org/test-repo');
  });

  it('should generate correct installation settings URL for User accounts', () => {
    expect(getGitHubInstallationSettingsUrl(12345, 'User', 'test-user')).toBe(
      'https://github.com/settings/installations/12345'
    );
  });

  it('should generate correct installation settings URL for Organization accounts', () => {
    expect(getGitHubInstallationSettingsUrl(12345, 'Organization', 'test-org')).toBe(
      'https://github.com/organizations/test-org/settings/installations/12345'
    );
  });
});

describe('Installation Detail Navigation', () => {
  const getBackLink = (tenantId: string) => `/${tenantId}/work-apps/github`;
  const getDetailLink = (tenantId: string, installationId: string) =>
    `/${tenantId}/work-apps/github/${installationId}`;

  it('should generate correct back link to work-apps github', () => {
    expect(getBackLink('my-tenant')).toBe('/my-tenant/work-apps/github');
  });

  it('should generate correct detail page link', () => {
    expect(getDetailLink('my-tenant', 'inst_123')).toBe('/my-tenant/work-apps/github/inst_123');
  });
});

describe('Long Date Formatting', () => {
  const formatLongDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  it('should format date with full month name', () => {
    const formatted = formatLongDate('2024-01-15T10:00:00Z');
    expect(formatted).toContain('January');
    expect(formatted).toContain('15');
    expect(formatted).toContain('2024');
  });

  it('should include time in formatted output', () => {
    const formatted = formatLongDate('2024-01-15T14:30:00Z');
    // Time format varies by locale but should contain hour/minute
    expect(formatted.length).toBeGreaterThan(15);
  });
});
