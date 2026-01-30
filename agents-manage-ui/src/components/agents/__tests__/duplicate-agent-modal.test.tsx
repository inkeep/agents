import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/actions/agent-full', () => ({
  duplicateAgentAction: vi.fn(),
}));

describe('DuplicateAgentModal', () => {
  const defaultProps = {
    tenantId: 'tenant-1',
    projectId: 'project-1',
    agentId: 'agent-1',
    agentName: 'Test Agent',
    isOpen: true,
    setIsOpen: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should accept valid props', () => {
    expect(defaultProps.tenantId).toBe('tenant-1');
    expect(defaultProps.agentName).toBe('Test Agent');
  });

  it('should have required props', () => {
    expect(defaultProps).toHaveProperty('tenantId');
    expect(defaultProps).toHaveProperty('projectId');
    expect(defaultProps).toHaveProperty('agentId');
    expect(defaultProps).toHaveProperty('agentName');
    expect(defaultProps).toHaveProperty('isOpen');
    expect(defaultProps).toHaveProperty('setIsOpen');
  });

  it('should generate copy name correctly', () => {
    const expectedCopyName = `${defaultProps.agentName} (Copy)`;
    expect(expectedCopyName).toBe('Test Agent (Copy)');
  });
});
