type PasswordResetLinkEntry = {
  email: string;
  url: string;
  token: string;
  createdAtMs: number;
};

const entriesByEmail = new Map<string, PasswordResetLinkEntry>();

export function setPasswordResetLink(entry: { email: string; url: string; token: string }): void {
  entriesByEmail.set(entry.email.toLowerCase(), {
    email: entry.email,
    url: entry.url,
    token: entry.token,
    createdAtMs: Date.now(),
  });
}

export function getLatestPasswordResetLink(
  email: string,
  maxAgeMs: number
): PasswordResetLinkEntry | null {
  const entry = entriesByEmail.get(email.toLowerCase());
  if (!entry) return null;
  if (Date.now() - entry.createdAtMs > maxAgeMs) return null;
  return entry;
}
