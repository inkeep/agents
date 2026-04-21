import { getSafeReturnUrl, isValidReturnUrl } from '../auth-redirect';

describe('isValidReturnUrl', () => {
  it('accepts relative application paths', () => {
    expect(isValidReturnUrl('/tenant/projects?tab=overview')).toBe(true);
  });

  it('rejects empty and non-relative values', () => {
    expect(isValidReturnUrl('')).toBe(false);
    expect(isValidReturnUrl(null)).toBe(false);
    expect(isValidReturnUrl(undefined)).toBe(false);
    expect(isValidReturnUrl('https://evil.com')).toBe(false);
  });

  it('rejects protocol-relative URLs', () => {
    expect(isValidReturnUrl('//evil.com')).toBe(false);
    expect(isValidReturnUrl('/%2Fevil.com')).toBe(false);
    expect(isValidReturnUrl('/%2f%2fevil.com')).toBe(false);
  });

  it('rejects raw and encoded backslash redirect bypasses', () => {
    expect(isValidReturnUrl('/\\evil.com')).toBe(false);
    expect(isValidReturnUrl('/%5Cevil.com')).toBe(false);
    expect(isValidReturnUrl('/%5cevil.com')).toBe(false);
    expect(isValidReturnUrl('/%5C%5Cevil.com')).toBe(false);
  });

  it('rejects malformed encodings', () => {
    expect(isValidReturnUrl('/%E0%A4%A')).toBe(false);
  });
});

describe('getSafeReturnUrl', () => {
  it('falls back for unsafe return URLs', () => {
    expect(getSafeReturnUrl('/\\evil.com', '/')).toBe('/');
  });

  it('preserves safe return URLs', () => {
    expect(getSafeReturnUrl('/tenant/projects', '/')).toBe('/tenant/projects');
  });
});
