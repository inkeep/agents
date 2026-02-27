import { describe, expect, it } from 'vitest';
import { getSlackProfileUrl } from '../slack-urls';

describe('getSlackProfileUrl', () => {
  it('returns workspace-scoped URL when teamDomain is valid', () => {
    expect(getSlackProfileUrl('U0771EUT0PR', 'acme-corp')).toBe(
      'https://acme-corp.slack.com/team/U0771EUT0PR'
    );
  });

  it('returns generic URL when teamDomain is undefined', () => {
    expect(getSlackProfileUrl('U0771EUT0PR', undefined)).toBe(
      'https://app.slack.com/team/U0771EUT0PR'
    );
  });

  it('returns generic URL when teamDomain is empty string', () => {
    expect(getSlackProfileUrl('U0771EUT0PR', '')).toBe('https://app.slack.com/team/U0771EUT0PR');
  });

  it('accepts alphanumeric domains', () => {
    expect(getSlackProfileUrl('U123', 'workspace42')).toBe(
      'https://workspace42.slack.com/team/U123'
    );
  });

  it('accepts domains with hyphens', () => {
    expect(getSlackProfileUrl('U123', 'my-team')).toBe('https://my-team.slack.com/team/U123');
  });

  it('rejects domain containing dots (open redirect: evil.com)', () => {
    expect(getSlackProfileUrl('U123', 'evil.com')).toBe('https://app.slack.com/team/U123');
  });

  it('rejects domain containing hash (fragment injection: evil.com/x#)', () => {
    expect(getSlackProfileUrl('U123', 'evil.com/x#')).toBe('https://app.slack.com/team/U123');
  });

  it('rejects domain containing question mark (query injection)', () => {
    expect(getSlackProfileUrl('U123', 'evil.com/x?')).toBe('https://app.slack.com/team/U123');
  });

  it('rejects domain containing slashes', () => {
    expect(getSlackProfileUrl('U123', 'evil.com/path')).toBe('https://app.slack.com/team/U123');
  });

  it('rejects domain with uppercase characters', () => {
    expect(getSlackProfileUrl('U123', 'ACME')).toBe('https://app.slack.com/team/U123');
  });

  it('rejects domain with spaces', () => {
    expect(getSlackProfileUrl('U123', 'my team')).toBe('https://app.slack.com/team/U123');
  });

  it('rejects domain with @ symbol', () => {
    expect(getSlackProfileUrl('U123', 'user@evil.com')).toBe('https://app.slack.com/team/U123');
  });

  it('rejects domain with colons (protocol injection)', () => {
    expect(getSlackProfileUrl('U123', 'javascript:')).toBe('https://app.slack.com/team/U123');
  });
});
