import { describe, expect, it } from 'vitest';
import { SandboxExecutorFactory } from '../SandboxExecutorFactory';

describe('SandboxExecutorFactory session scoping', () => {
  it('returns the same factory for the same sessionId', () => {
    const a = SandboxExecutorFactory.getForSession('s1');
    const b = SandboxExecutorFactory.getForSession('s1');
    expect(a).toBe(b);
  });

  it('returns different factories for different sessionIds', () => {
    const a = SandboxExecutorFactory.getForSession('s2');
    const b = SandboxExecutorFactory.getForSession('s3');
    expect(a).not.toBe(b);
  });

  it('cleanupSession removes the cached factory', async () => {
    const a = SandboxExecutorFactory.getForSession('s4');
    await SandboxExecutorFactory.cleanupSession('s4');
    const b = SandboxExecutorFactory.getForSession('s4');
    expect(a).not.toBe(b);
  });
});
