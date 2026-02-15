type EmailSendStatus = {
  emailSent: boolean;
  error?: string;
};

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

const store = new Map<string, EmailSendStatus>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function setEmailSendStatus(
  id: string,
  status: EmailSendStatus,
  ttlMs: number = DEFAULT_TTL_MS
): void {
  const existingTimer = timers.get(id);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  store.set(id, status);

  const timer = setTimeout(() => {
    store.delete(id);
    timers.delete(id);
  }, ttlMs);

  timers.set(id, timer);
}

export function getEmailSendStatus(id: string): EmailSendStatus | null {
  return store.get(id) ?? null;
}
