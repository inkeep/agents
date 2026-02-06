type PasswordResetLinkEntry = {
  email: string;
  url: string;
  token: string;
};

const pendingResolvers = new Map<string, (entry: PasswordResetLinkEntry) => void>();

/**
 * Sets up a listener that resolves when `setPasswordResetLink` fires for this email.
 * Call BEFORE `auth.api.requestPasswordReset()`.
 *
 * This creates a per-request promise bridge: the `sendResetPassword` callback
 * (configured in auth.ts) calls `setPasswordResetLink`, which resolves this promise
 * within the same HTTP request on the same server instance.
 */
export function waitForPasswordResetLink(
  email: string,
  timeoutMs = 10_000
): Promise<PasswordResetLinkEntry> {
  const key = email.toLowerCase();
  return new Promise<PasswordResetLinkEntry>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingResolvers.delete(key);
      reject(new Error('Timed out waiting for password reset link'));
    }, timeoutMs);

    pendingResolvers.set(key, (entry) => {
      clearTimeout(timeout);
      pendingResolvers.delete(key);
      resolve(entry);
    });
  });
}

/**
 * Called from the `sendResetPassword` callback in auth config.
 * Resolves the pending promise for this email (if any).
 */
export function setPasswordResetLink(entry: { email: string; url: string; token: string }): void {
  const key = entry.email.toLowerCase();
  const resolver = pendingResolvers.get(key);
  if (resolver) {
    resolver({ email: entry.email, url: entry.url, token: entry.token });
  }
}
