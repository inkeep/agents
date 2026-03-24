type EmailSendStatus = {
  emailSent: boolean;
  error?: string;
  organizationId?: string;
};

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

const STORE_KEY = Symbol.for('inkeep:email-send-status-store');
const TIMERS_KEY = Symbol.for('inkeep:email-send-status-timers');

function getStore(): Map<string, EmailSendStatus> {
  const g = globalThis as Record<symbol, unknown>;
  if (!g[STORE_KEY]) {
    g[STORE_KEY] = new Map<string, EmailSendStatus>();
  }
  return g[STORE_KEY] as Map<string, EmailSendStatus>;
}

function getTimers(): Map<string, ReturnType<typeof setTimeout>> {
  const g = globalThis as Record<symbol, unknown>;
  if (!g[TIMERS_KEY]) {
    g[TIMERS_KEY] = new Map<string, ReturnType<typeof setTimeout>>();
  }
  return g[TIMERS_KEY] as Map<string, ReturnType<typeof setTimeout>>;
}

export function setEmailSendStatus(
  id: string,
  status: EmailSendStatus,
  ttlMs: number = DEFAULT_TTL_MS
): void {
  const store = getStore();
  const timers = getTimers();

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
  return getStore().get(id) ?? null;
}
