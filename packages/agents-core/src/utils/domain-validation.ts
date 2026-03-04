export function validateOrigin(
  origin: string | null | undefined,
  allowedDomains: string[]
): boolean {
  if (!origin || allowedDomains.length === 0) {
    return false;
  }

  let hostname: string;
  try {
    const url = new URL(origin);
    hostname = url.hostname;
  } catch {
    return false;
  }

  for (const domain of allowedDomains) {
    if (domain === '*') {
      return true;
    }

    if (domain.startsWith('*.')) {
      const suffix = domain.slice(2);
      if (hostname === suffix || hostname.endsWith(`.${suffix}`)) {
        return true;
      }
    } else if (hostname === domain) {
      return true;
    }
  }

  return false;
}
