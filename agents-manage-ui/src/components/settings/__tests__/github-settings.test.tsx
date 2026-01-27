import type { GitHubInstallation } from '@/lib/api/github';

// Mock data for testing
const mockInstallation: GitHubInstallation = {
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

const mockUserInstallation: GitHubInstallation = {
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

const mockPendingInstallation: GitHubInstallation = {
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

const mockSuspendedInstallation: GitHubInstallation = {
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
  const getStatusBadgeVariant = (status: GitHubInstallation['status']) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'pending':
        return 'warning';
      case 'suspended':
        return 'error';
      case 'deleted':
        return 'code';
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

  it('should map deleted status to code variant', () => {
    expect(getStatusBadgeVariant('deleted')).toBe('code');
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
  const navItems = [
    {
      label: 'Organization',
      href: (tenantId: string) => `/${tenantId}/settings`,
      exact: true,
    },
    {
      label: 'GitHub',
      href: (tenantId: string) => `/${tenantId}/settings/github`,
      exact: false,
    },
  ];

  it('should have Organization and GitHub nav items', () => {
    expect(navItems).toHaveLength(2);
    expect(navItems[0].label).toBe('Organization');
    expect(navItems[1].label).toBe('GitHub');
  });

  it('should generate correct hrefs for tenant', () => {
    const tenantId = 'my-tenant';
    expect(navItems[0].href(tenantId)).toBe('/my-tenant/settings');
    expect(navItems[1].href(tenantId)).toBe('/my-tenant/settings/github');
  });

  it('should have correct exact match settings', () => {
    expect(navItems[0].exact).toBe(true);
    expect(navItems[1].exact).toBe(false);
  });
});
