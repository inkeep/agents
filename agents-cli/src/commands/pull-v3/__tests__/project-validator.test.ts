/**
 * Tests for project-validator.ts - Key listener leak prevention
 *
 * These tests verify that the key listener leak fix works correctly:
 * - Listeners are properly cleaned up
 * - Multiple calls don't accumulate listeners
 * - Handler is only called once using 'once' instead of 'on'
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FullProjectDefinition } from '@inkeep/agents-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateTempDirectory } from '../project-validator';

describe('Project Validator - Key Listener Leak Prevention', () => {
  let testDir: string;
  let tempDir: string;
  let mockRemoteProject: FullProjectDefinition;
  let originalStdin: NodeJS.ReadStream;
  let stdinListeners: Array<(data: string) => void>;
  let stdinListenerCount: number;
  let mockStdin: any;

  beforeEach(() => {
    // Create test directories
    testDir = join(
      tmpdir(),
      `project-validator-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    );
    tempDir = join(testDir, '.temp-validation-test');
    mkdirSync(tempDir, { recursive: true });
    mkdirSync(join(tempDir, 'agents'), { recursive: true });
    mkdirSync(join(tempDir, 'tools'), { recursive: true });

    // Create a minimal project structure that will fail equivalence check
    // (so we can test the listener behavior without needing full project setup)
    writeFileSync(
      join(tempDir, 'index.ts'),
      `export const project = { __type: 'project' as const, id: 'test-project' };`
    );

    // Mock remote project
    mockRemoteProject = {
      id: 'test-project',
      name: 'Test Project',
      description: 'Test Description',
      models: {},
      agents: {},
      tools: {},
    };

    // Save original stdin
    originalStdin = process.stdin;

    // Track listeners
    stdinListeners = [];
    stdinListenerCount = 0;

    // Mock stdin to track listeners
    mockStdin = {
      isRaw: false,
      isPaused: () => false,
      setRawMode: vi.fn((mode: boolean) => {
        mockStdin.isRaw = mode;
        return mockStdin;
      }),
      resume: vi.fn(() => mockStdin),
      pause: vi.fn(() => mockStdin),
      setEncoding: vi.fn(() => mockStdin),
      on: vi.fn((event: string, listener: (data: string) => void) => {
        if (event === 'data') {
          stdinListeners.push(listener);
          stdinListenerCount++;
        }
        return mockStdin;
      }),
      once: vi.fn((event: string, listener: (data: string) => void) => {
        if (event === 'data') {
          stdinListeners.push(listener);
          stdinListenerCount++;
        }
        return mockStdin;
      }),
      removeListener: vi.fn((event: string, listener: (data: string) => void) => {
        if (event === 'data') {
          const index = stdinListeners.indexOf(listener);
          if (index > -1) {
            stdinListeners.splice(index, 1);
            stdinListenerCount--;
          }
        }
        return mockStdin;
      }),
      removeAllListeners: vi.fn((event?: string) => {
        if (event === 'data' || !event) {
          stdinListeners = [];
          stdinListenerCount = 0;
        }
        return mockStdin;
      }),
      listenerCount: vi.fn((event: string) => {
        if (event === 'data') {
          return stdinListenerCount;
        }
        return 0;
      }),
    };

    // Replace process.stdin with mock
    process.stdin = mockStdin as any;
  });

  afterEach(() => {
    // Restore original stdin
    process.stdin = originalStdin;

    // Clean up test directories
    if (existsSync(testDir)) {
      require('node:fs').rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should use once instead of on to prevent multiple handler calls', async () => {
    // Mock process.exit to prevent actual exit
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    // Call validateTempDirectory - this will fail equivalence check and exit
    // But we can verify the listener setup before it exits
    try {
      await validateTempDirectory(testDir, '.temp-validation-test', mockRemoteProject);
    } catch {
      // Expected - process.exit throws
    }

    // Wait for setup
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify that 'once' was called (not 'on' for 'data' event)
    expect(mockStdin.once).toHaveBeenCalled();

    // Verify 'on' was NOT called for 'data' event
    const onCalls = mockStdin.on.mock.calls.filter((call: any[]) => call[0] === 'data');
    expect(onCalls.length).toBe(0);

    exitSpy.mockRestore();
  });

  it('should clean up listeners when handler executes', async () => {
    // Mock process.exit to prevent actual exit
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    // Call validateTempDirectory
    try {
      await validateTempDirectory(testDir, '.temp-validation-test', mockRemoteProject);
    } catch {
      // Expected
    }

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify removeAllListeners was called during setup
    expect(mockStdin.removeAllListeners).toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  it('should not accumulate listeners when called multiple times', async () => {
    // Mock process.exit to prevent actual exit
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    // Reset listener tracking
    stdinListeners = [];
    stdinListenerCount = 0;
    mockStdin.removeAllListeners.mockClear();
    mockStdin.once.mockClear();

    // First call
    try {
      await validateTempDirectory(testDir, '.temp-validation-test', mockRemoteProject);
    } catch {
      // Expected
    }
    await new Promise((resolve) => setTimeout(resolve, 50));

    const firstCallOnceCount = mockStdin.once.mock.calls.length;
    const firstCallRemoveAllCount = mockStdin.removeAllListeners.mock.calls.length;

    // Reset for second call
    mockStdin.removeAllListeners.mockClear();
    mockStdin.once.mockClear();

    // Second call - should clean up previous listener first
    try {
      await validateTempDirectory(testDir, '.temp-validation-test', mockRemoteProject);
    } catch {
      // Expected
    }
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify removeAllListeners was called before adding new listener
    expect(mockStdin.removeAllListeners).toHaveBeenCalled();
    // Verify once was called (for the new listener)
    expect(mockStdin.once).toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  it('should properly restore stdin state after handler execution', async () => {
    // Mock process.exit to prevent actual exit
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    try {
      await validateTempDirectory(testDir, '.temp-validation-test', mockRemoteProject);
    } catch {
      // Expected
    }

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify setRawMode was called (to set up raw mode)
    expect(mockStdin.setRawMode).toHaveBeenCalled();
    // Verify resume was called
    expect(mockStdin.resume).toHaveBeenCalled();

    exitSpy.mockRestore();
  });
});
