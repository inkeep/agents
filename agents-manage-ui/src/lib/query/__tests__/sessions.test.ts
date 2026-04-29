// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { formatNullableField, parseDeviceDescriptor, sortSessions } from '../sessions';

describe('parseDeviceDescriptor', () => {
  it('returns "Browser on OS" for a parseable user agent', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15';
    expect(parseDeviceDescriptor(ua)).toBe('Safari on Mac OS');
  });

  it('returns "Unknown device" for null', () => {
    expect(parseDeviceDescriptor(null)).toBe('Unknown device');
  });

  it('returns "Unknown device" for empty string', () => {
    expect(parseDeviceDescriptor('')).toBe('Unknown device');
  });

  it('returns "Unknown device" for completely unparseable input', () => {
    expect(parseDeviceDescriptor('!@#$%^&*()_+')).toBe('Unknown device');
  });

  it('falls back to whatever component is parseable', () => {
    const onlyOs = parseDeviceDescriptor('Mozilla/5.0 (Linux; Android 13; Pixel 7) Gecko/20100101');
    expect(onlyOs.length).toBeGreaterThan(0);
    expect(onlyOs).not.toBe('Unknown device');
  });

  it('renders the inkeep-cli User-Agent as "Inkeep CLI <version>"', () => {
    const ua = 'inkeep-cli/0.70.5 node/22.18.0 darwin/arm64';
    expect(parseDeviceDescriptor(ua)).toBe('Inkeep CLI 0.70.5');
  });

  it('matches inkeep-cli User-Agent case-insensitively', () => {
    const ua = 'Inkeep-CLI/1.2.3 node/22.0.0 linux/x64';
    expect(parseDeviceDescriptor(ua)).toBe('Inkeep CLI 1.2.3');
  });

  it('returns "Unknown device" for the bare "node" UA (Node default fetch fallback)', () => {
    expect(parseDeviceDescriptor('node')).toBe('Unknown device');
  });
});

describe('formatNullableField', () => {
  it('returns the value when present', () => {
    expect(formatNullableField('192.168.1.1')).toBe('192.168.1.1');
  });

  it('returns "—" for null', () => {
    expect(formatNullableField(null)).toBe('—');
  });

  it('returns "—" for undefined', () => {
    expect(formatNullableField(undefined)).toBe('—');
  });

  it('returns "—" for empty string', () => {
    expect(formatNullableField('')).toBe('—');
  });
});

describe('sortSessions', () => {
  it('returns the same single session when only one is present', () => {
    const sessions = [{ id: 'a', updatedAt: '2026-04-27T10:00:00Z' }];
    expect(sortSessions(sessions, 'a')).toEqual(sessions);
  });

  it('returns the same array when zero sessions', () => {
    expect(sortSessions([], 'unknown')).toEqual([]);
  });

  it('pins the current session to position 0 and sorts the rest by updatedAt desc', () => {
    const sessions = [
      { id: 'old', updatedAt: '2026-04-25T10:00:00Z' },
      { id: 'current', updatedAt: '2026-04-26T10:00:00Z' },
      { id: 'newest', updatedAt: '2026-04-27T10:00:00Z' },
    ];

    const sorted = sortSessions(sessions, 'current');

    expect(sorted.map((s) => s.id)).toEqual(['current', 'newest', 'old']);
  });

  it('sorts purely by updatedAt desc when no current session is matched', () => {
    const sessions = [
      { id: 'a', updatedAt: '2026-04-25T10:00:00Z' },
      { id: 'b', updatedAt: '2026-04-27T10:00:00Z' },
      { id: 'c', updatedAt: '2026-04-26T10:00:00Z' },
    ];

    const sorted = sortSessions(sessions, null);

    expect(sorted.map((s) => s.id)).toEqual(['b', 'c', 'a']);
  });

  it('does not mutate the input array', () => {
    const sessions = [
      { id: 'a', updatedAt: '2026-04-25T10:00:00Z' },
      { id: 'b', updatedAt: '2026-04-27T10:00:00Z' },
    ];
    const snapshot = [...sessions];

    sortSessions(sessions, 'a');

    expect(sessions).toEqual(snapshot);
  });
});
