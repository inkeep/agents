import { describe, expect, it } from 'vitest';
import { isBlockedIpAddress, makeSanitizedSourceUrl } from '../blob-storage/file-url-security';

describe('file-url-security', () => {
  it('strips query and hash for metadata source URLs', () => {
    expect(makeSanitizedSourceUrl('https://example.com/doc.pdf?token=secret#frag')).toBe(
      'https://example.com/doc.pdf'
    );
  });

  it('blocks private and loopback addresses', () => {
    expect(isBlockedIpAddress('127.0.0.1')).toBe(true);
    expect(isBlockedIpAddress('10.0.0.1')).toBe(true);
    expect(isBlockedIpAddress('::1')).toBe(true);
  });

  it('allows public addresses', () => {
    expect(isBlockedIpAddress('93.184.216.34')).toBe(false);
    expect(isBlockedIpAddress('2606:2800:220:1:248:1893:25c8:1946')).toBe(false);
  });
});
