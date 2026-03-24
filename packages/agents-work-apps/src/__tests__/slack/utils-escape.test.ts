import { describe, expect, it } from 'vitest';
import { escapeSlackLinkText, escapeSlackMrkdwn } from '../../slack/services/events/utils';

describe('escapeSlackMrkdwn', () => {
  it('should escape ampersands', () => {
    expect(escapeSlackMrkdwn('a & b')).toBe('a &amp; b');
  });

  it('should escape less-than signs', () => {
    expect(escapeSlackMrkdwn('a < b')).toBe('a &lt; b');
  });

  it('should escape greater-than signs', () => {
    expect(escapeSlackMrkdwn('a > b')).toBe('a &gt; b');
  });

  it('should escape all three special characters together', () => {
    expect(escapeSlackMrkdwn('<tool> & "more"')).toBe('&lt;tool&gt; &amp; "more"');
  });

  it('should escape multiple occurrences in a string', () => {
    expect(escapeSlackMrkdwn('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
  });

  it('should not modify strings with no special characters', () => {
    expect(escapeSlackMrkdwn('hello world')).toBe('hello world');
  });

  it('should return an empty string unchanged', () => {
    expect(escapeSlackMrkdwn('')).toBe('');
  });

  it('should escape & before < and > to avoid double-encoding', () => {
    expect(escapeSlackMrkdwn('&lt;')).toBe('&amp;lt;');
  });
});

describe('escapeSlackLinkText', () => {
  it('should escape ampersands', () => {
    expect(escapeSlackLinkText('Foo & Bar')).toBe('Foo &amp; Bar');
  });

  it('should escape less-than signs', () => {
    expect(escapeSlackLinkText('a < b')).toBe('a &lt; b');
  });

  it('should escape greater-than signs to prevent link termination', () => {
    expect(escapeSlackLinkText('a > b')).toBe('a &gt; b');
  });

  it('should escape all three special characters together', () => {
    expect(escapeSlackLinkText('<title> & more')).toBe('&lt;title&gt; &amp; more');
  });

  it('should not modify strings with no special characters', () => {
    expect(escapeSlackLinkText('Clean Title')).toBe('Clean Title');
  });

  it('should return an empty string unchanged', () => {
    expect(escapeSlackLinkText('')).toBe('');
  });
});
