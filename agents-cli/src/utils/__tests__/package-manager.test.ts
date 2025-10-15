import { describe, it, expect, vi } from 'vitest';
import { getUpdateCommand, type PackageManager } from '../package-manager';

describe('package-manager', () => {
  describe('getUpdateCommand', () => {
    it('should return correct command for npm', () => {
      const command = getUpdateCommand('npm');
      expect(command).toBe('npm install -g @inkeep/agents-cli@latest');
    });

    it('should return correct command for pnpm', () => {
      const command = getUpdateCommand('pnpm');
      expect(command).toBe('pnpm add -g @inkeep/agents-cli@latest');
    });

    it('should return correct command for bun', () => {
      const command = getUpdateCommand('bun');
      expect(command).toBe('bun add -g @inkeep/agents-cli@latest');
    });

    it('should return correct command for yarn', () => {
      const command = getUpdateCommand('yarn');
      expect(command).toBe('yarn global add @inkeep/agents-cli@latest');
    });

    it('should accept custom package name', () => {
      const command = getUpdateCommand('npm', '@custom/package');
      expect(command).toBe('npm install -g @custom/package@latest');
    });
  });

  describe('detectPackageManager', () => {
    // Note: detectPackageManager is difficult to test without actually executing commands
    // In a real implementation, you would mock child_process.exec
    it('should be defined', async () => {
      const { detectPackageManager } = await import('../package-manager');
      expect(detectPackageManager).toBeDefined();
      expect(typeof detectPackageManager).toBe('function');
    });
  });

  describe('executeUpdate', () => {
    // Note: executeUpdate should not be tested with actual package manager commands
    // In production tests, you would mock child_process.exec
    it('should be defined', async () => {
      const { executeUpdate } = await import('../package-manager');
      expect(executeUpdate).toBeDefined();
      expect(typeof executeUpdate).toBe('function');
    });

    it('should throw error for unsupported package manager', async () => {
      const { executeUpdate } = await import('../package-manager');
      // @ts-expect-error Testing invalid input
      await expect(executeUpdate('invalid-manager')).rejects.toThrow(
        'Unsupported package manager: invalid-manager'
      );
    });

    it('should throw error for potentially malicious input', async () => {
      const { executeUpdate } = await import('../package-manager');
      // @ts-expect-error Testing invalid input
      await expect(executeUpdate('npm && rm -rf /')).rejects.toThrow(
        'Unsupported package manager'
      );
    });
  });
});
