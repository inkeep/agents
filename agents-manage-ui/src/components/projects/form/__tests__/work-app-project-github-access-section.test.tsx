import type {
  WorkAppGitHubAccessMode,
  WorkAppGitHubInstallation,
  WorkAppGitHubProjectAccess,
  WorkAppGitHubRepository,
} from '@/lib/api/github';

// Mock installation data
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

// Mock repository data
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

const mockUserRepository: WorkAppGitHubRepository = {
  id: 'repo_789',
  installationId: 'inst_456',
  repositoryId: '111222',
  repositoryName: 'user-repo',
  repositoryFullName: 'test-user/user-repo',
  private: false,
  createdAt: '2024-01-12T10:00:00Z',
  updatedAt: '2024-01-19T15:30:00Z',
};

describe('ProjectGitHubAccess Types', () => {
  it('should support mode "all" with empty repositories', () => {
    const access: WorkAppGitHubProjectAccess = {
      mode: 'all',
      repositories: [],
    };

    expect(access.mode).toBe('all');
    expect(access.repositories).toHaveLength(0);
  });

  it('should support mode "selected" with populated repositories', () => {
    const access: WorkAppGitHubProjectAccess = {
      mode: 'selected',
      repositories: [mockRepository, mockPrivateRepository],
    };

    expect(access.mode).toBe('selected');
    expect(access.repositories).toHaveLength(2);
    expect(access.repositories[0].repositoryName).toBe('test-repo');
  });

  it('should correctly identify public vs private repositories', () => {
    expect(mockRepository.private).toBe(false);
    expect(mockPrivateRepository.private).toBe(true);
  });

  it('should have valid repository full names', () => {
    expect(mockRepository.repositoryFullName).toContain('/');
    expect(mockRepository.repositoryFullName.split('/')[0]).toBe('test-org');
    expect(mockRepository.repositoryFullName.split('/')[1]).toBe('test-repo');
  });
});

describe('GitHubAccessMode', () => {
  it('should accept "all" as valid mode', () => {
    const mode: WorkAppGitHubAccessMode = 'all';
    expect(['all', 'selected']).toContain(mode);
  });

  it('should accept "selected" as valid mode', () => {
    const mode: WorkAppGitHubAccessMode = 'selected';
    expect(['all', 'selected']).toContain(mode);
  });
});

describe('Access Mode Display Logic', () => {
  const getAccessModeDescription = (mode: WorkAppGitHubAccessMode, repoCount: number) => {
    if (mode === 'all') {
      return 'This project can access all repositories from connected GitHub organizations';
    }
    return `This project can access ${repoCount} specific repositories`;
  };

  it('should display correct description for mode "all"', () => {
    const description = getAccessModeDescription('all', 0);
    expect(description).toContain('all repositories');
  });

  it('should display correct description for mode "selected" with count', () => {
    const description = getAccessModeDescription('selected', 3);
    expect(description).toContain('3 specific repositories');
  });

  it('should display correct description for mode "selected" with single repo', () => {
    const description = getAccessModeDescription('selected', 1);
    expect(description).toContain('1 specific repositories');
  });
});

describe('Access Mode Summary Display', () => {
  const getAccessSummary = (mode: WorkAppGitHubAccessMode, repoCount: number) => {
    if (mode === 'all') {
      return 'All repositories';
    }
    return `${repoCount} selected`;
  };

  it('should show "All repositories" for mode all', () => {
    expect(getAccessSummary('all', 0)).toBe('All repositories');
  });

  it('should show count for selected mode', () => {
    expect(getAccessSummary('selected', 5)).toBe('5 selected');
  });

  it('should show zero count if no repos selected', () => {
    expect(getAccessSummary('selected', 0)).toBe('0 selected');
  });
});

describe('Repository Selection Logic', () => {
  const toggleRepoSelection = (selected: Set<string>, repoId: string): Set<string> => {
    const newSet = new Set(selected);
    if (newSet.has(repoId)) {
      newSet.delete(repoId);
    } else {
      newSet.add(repoId);
    }
    return newSet;
  };

  it('should add repo to selection when not selected', () => {
    const selected = new Set<string>();
    const result = toggleRepoSelection(selected, 'repo_123');
    expect(result.has('repo_123')).toBe(true);
    expect(result.size).toBe(1);
  });

  it('should remove repo from selection when already selected', () => {
    const selected = new Set(['repo_123']);
    const result = toggleRepoSelection(selected, 'repo_123');
    expect(result.has('repo_123')).toBe(false);
    expect(result.size).toBe(0);
  });

  it('should not affect other selected repos', () => {
    const selected = new Set(['repo_123', 'repo_456']);
    const result = toggleRepoSelection(selected, 'repo_789');
    expect(result.has('repo_123')).toBe(true);
    expect(result.has('repo_456')).toBe(true);
    expect(result.has('repo_789')).toBe(true);
    expect(result.size).toBe(3);
  });
});

describe('Select All Logic', () => {
  const selectAllForInstallation = (
    selected: Set<string>,
    repos: WorkAppGitHubRepository[],
    shouldSelect: boolean
  ): Set<string> => {
    const newSet = new Set(selected);
    for (const repo of repos) {
      if (shouldSelect) {
        newSet.add(repo.id);
      } else {
        newSet.delete(repo.id);
      }
    }
    return newSet;
  };

  const orgRepos = [mockRepository, mockPrivateRepository];

  it('should select all repos when shouldSelect is true', () => {
    const selected = new Set<string>();
    const result = selectAllForInstallation(selected, orgRepos, true);
    expect(result.has('repo_123')).toBe(true);
    expect(result.has('repo_456')).toBe(true);
    expect(result.size).toBe(2);
  });

  it('should deselect all repos when shouldSelect is false', () => {
    const selected = new Set(['repo_123', 'repo_456']);
    const result = selectAllForInstallation(selected, orgRepos, false);
    expect(result.has('repo_123')).toBe(false);
    expect(result.has('repo_456')).toBe(false);
    expect(result.size).toBe(0);
  });

  it('should preserve repos from other installations', () => {
    const selected = new Set(['repo_789']); // From a different installation
    const result = selectAllForInstallation(selected, orgRepos, true);
    expect(result.has('repo_123')).toBe(true);
    expect(result.has('repo_456')).toBe(true);
    expect(result.has('repo_789')).toBe(true);
    expect(result.size).toBe(3);
  });
});

describe('Installation Grouping', () => {
  const groupReposByInstallation = (repos: WorkAppGitHubRepository[]) => {
    const groups = new Map<string, WorkAppGitHubRepository[]>();
    for (const repo of repos) {
      const existing = groups.get(repo.installationId) || [];
      groups.set(repo.installationId, [...existing, repo]);
    }
    return groups;
  };

  it('should group repos by installation', () => {
    const allRepos = [mockRepository, mockPrivateRepository, mockUserRepository];
    const groups = groupReposByInstallation(allRepos);

    expect(groups.size).toBe(2);
    expect(groups.get('inst_123')).toHaveLength(2);
    expect(groups.get('inst_456')).toHaveLength(1);
  });

  it('should handle empty repo list', () => {
    const groups = groupReposByInstallation([]);
    expect(groups.size).toBe(0);
  });
});

describe('Checkbox State Calculation', () => {
  const calculateCheckboxState = (
    selectedIds: Set<string>,
    repoIds: string[]
  ): { allSelected: boolean; someSelected: boolean } => {
    const allSelected = repoIds.every((id) => selectedIds.has(id));
    const someSelected = repoIds.some((id) => selectedIds.has(id)) && !allSelected;
    return { allSelected, someSelected };
  };

  const repoIds = ['repo_123', 'repo_456'];

  it('should return allSelected=true when all repos selected', () => {
    const selected = new Set(['repo_123', 'repo_456']);
    const { allSelected, someSelected } = calculateCheckboxState(selected, repoIds);
    expect(allSelected).toBe(true);
    expect(someSelected).toBe(false);
  });

  it('should return someSelected=true when partial selection', () => {
    const selected = new Set(['repo_123']);
    const { allSelected, someSelected } = calculateCheckboxState(selected, repoIds);
    expect(allSelected).toBe(false);
    expect(someSelected).toBe(true);
  });

  it('should return both false when none selected', () => {
    const selected = new Set<string>();
    const { allSelected, someSelected } = calculateCheckboxState(selected, repoIds);
    expect(allSelected).toBe(false);
    expect(someSelected).toBe(false);
  });
});

describe('Validation for Selected Mode', () => {
  const validateSelectedMode = (
    mode: WorkAppGitHubAccessMode,
    selectedIds: Set<string>
  ): string | null => {
    if (mode === 'selected' && selectedIds.size === 0) {
      return 'Please select at least one repository';
    }
    return null;
  };

  it('should return error when selected mode with no repos', () => {
    const error = validateSelectedMode('selected', new Set());
    expect(error).toBe('Please select at least one repository');
  });

  it('should return null when selected mode with repos', () => {
    const error = validateSelectedMode('selected', new Set(['repo_123']));
    expect(error).toBeNull();
  });

  it('should return null when all mode regardless of selection', () => {
    const error = validateSelectedMode('all', new Set());
    expect(error).toBeNull();
  });
});

describe('API Request Body Construction', () => {
  const buildRequestBody = (
    mode: WorkAppGitHubAccessMode,
    selectedIds: Set<string>
  ): { mode: WorkAppGitHubAccessMode; repositoryIds?: string[] } => {
    return {
      mode,
      repositoryIds: mode === 'selected' ? Array.from(selectedIds) : undefined,
    };
  };

  it('should include repositoryIds for selected mode', () => {
    const body = buildRequestBody('selected', new Set(['repo_123', 'repo_456']));
    expect(body.mode).toBe('selected');
    expect(body.repositoryIds).toHaveLength(2);
    expect(body.repositoryIds).toContain('repo_123');
    expect(body.repositoryIds).toContain('repo_456');
  });

  it('should not include repositoryIds for all mode', () => {
    const body = buildRequestBody('all', new Set(['repo_123']));
    expect(body.mode).toBe('all');
    expect(body.repositoryIds).toBeUndefined();
  });
});

describe('Empty State Detection', () => {
  const shouldShowEmptyState = (installations: WorkAppGitHubInstallation[]) => {
    return installations.length === 0;
  };

  it('should show empty state when no installations', () => {
    expect(shouldShowEmptyState([])).toBe(true);
  });

  it('should not show empty state when installations exist', () => {
    expect(shouldShowEmptyState([mockInstallation])).toBe(false);
  });
});

describe('Visibility Badge Logic', () => {
  const getVisibilityBadgeVariant = (isPrivate: boolean) => {
    return isPrivate ? 'code' : 'success';
  };

  const getVisibilityLabel = (isPrivate: boolean) => {
    return isPrivate ? 'Private' : 'Public';
  };

  it('should return code variant for private repos', () => {
    expect(getVisibilityBadgeVariant(true)).toBe('code');
  });

  it('should return success variant for public repos', () => {
    expect(getVisibilityBadgeVariant(false)).toBe('success');
  });

  it('should return correct labels', () => {
    expect(getVisibilityLabel(true)).toBe('Private');
    expect(getVisibilityLabel(false)).toBe('Public');
  });
});

describe('Repository URL Generation', () => {
  const getRepoUrl = (fullName: string) => `https://github.com/${fullName}`;
  const getOrgName = (fullName: string) => fullName.split('/')[0];

  it('should generate correct GitHub URL', () => {
    expect(getRepoUrl('test-org/test-repo')).toBe('https://github.com/test-org/test-repo');
  });

  it('should extract org name from full name', () => {
    expect(getOrgName('test-org/test-repo')).toBe('test-org');
    expect(getOrgName('test-user/user-repo')).toBe('test-user');
  });
});

describe('Installation Type Icon Logic', () => {
  const getInstallationIcon = (accountType: WorkAppGitHubInstallation['accountType']) => {
    return accountType === 'Organization' ? 'Building2' : 'User';
  };

  it('should return Building2 for Organization', () => {
    expect(getInstallationIcon('Organization')).toBe('Building2');
  });

  it('should return User for User account', () => {
    expect(getInstallationIcon('User')).toBe('User');
  });
});

describe('Active Installation Filter', () => {
  const filterActiveInstallations = (installations: WorkAppGitHubInstallation[]) => {
    return installations.filter((i) => i.status === 'active');
  };

  const mockPendingInstallation: WorkAppGitHubInstallation = {
    ...mockInstallation,
    id: 'inst_pending',
    status: 'pending',
  };

  const mockSuspendedInstallation: WorkAppGitHubInstallation = {
    ...mockInstallation,
    id: 'inst_suspended',
    status: 'suspended',
  };

  it('should only return active installations', () => {
    const installations = [
      mockInstallation,
      mockUserInstallation,
      mockPendingInstallation,
      mockSuspendedInstallation,
    ];
    const active = filterActiveInstallations(installations);
    expect(active).toHaveLength(2);
    expect(active.every((i) => i.status === 'active')).toBe(true);
  });

  it('should return empty array when no active installations', () => {
    const installations = [mockPendingInstallation, mockSuspendedInstallation];
    const active = filterActiveInstallations(installations);
    expect(active).toHaveLength(0);
  });
});
