import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isLocalhostUrl, confirmMigration } from '../../db/utils';

describe('isLocalhostUrl', () => {
  it('should return true for localhost URL', () => {
    expect(isLocalhostUrl('postgresql://user:pass@localhost:5432/db')).toBe(true);
  });

  it('should return true for localhost without port', () => {
    expect(isLocalhostUrl('postgresql://user:pass@localhost/db')).toBe(true);
  });

  it('should return true for 127.0.0.1 URL', () => {
    expect(isLocalhostUrl('postgresql://user:pass@127.0.0.1:5432/db')).toBe(true);
  });

  it('should return false for remote URL', () => {
    expect(isLocalhostUrl('postgresql://user:pass@db.example.com:5432/db')).toBe(false);
  });

  it('should return false for IP address that is not localhost', () => {
    expect(isLocalhostUrl('postgresql://user:pass@192.168.1.1:5432/db')).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isLocalhostUrl(undefined)).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(isLocalhostUrl('')).toBe(false);
  });

  it('should return false for URL containing localhost in path but not host', () => {
    expect(isLocalhostUrl('postgresql://user:pass@remote.com/localhost')).toBe(false);
  });

  it('should handle http URLs with localhost', () => {
    expect(isLocalhostUrl('http://localhost:3000')).toBe(true);
  });

  it('should handle https URLs with localhost', () => {
    expect(isLocalhostUrl('https://localhost:443')).toBe(true);
  });

  it('should handle URLs with credentials containing localhost keyword', () => {
    expect(isLocalhostUrl('postgresql://localhost_user:pass@remote.com:5432/db')).toBe(false);
  });
});

describe('confirmMigration', () => {
  let mockExit: ReturnType<typeof vi.spyOn>;
  let mockWarn: ReturnType<typeof vi.spyOn>;
  let mockError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    mockWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should exit with error if connectionString is undefined', async () => {
    await expect(confirmMigration(undefined)).rejects.toThrow('process.exit called');
    expect(mockError).toHaveBeenCalledWith('❌ Error: Database URL is not set.');
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should return true without prompting for localhost URL', async () => {
    const result = await confirmMigration('postgresql://user:pass@localhost:5432/db');
    expect(result).toBe(true);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('should return true without prompting for 127.0.0.1 URL', async () => {
    const result = await confirmMigration('postgresql://user:pass@127.0.0.1:5432/db');
    expect(result).toBe(true);
    expect(mockWarn).not.toHaveBeenCalled();
  });
});
